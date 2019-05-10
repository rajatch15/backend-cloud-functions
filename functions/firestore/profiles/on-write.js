/**
 * Copyright (c) 2018 GrowthFile
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 *
 */


'use strict';

const https = require('https');
const {
  db,
  rootCollections,
} = require('../../admin/admin');
const {
  reportNames,
  httpsActions,
} = require('../../admin/constants');
const env = require('../../admin/env');
const moment = require('moment');

const sendSMS = (change) => {
  const {
    downloadUrl,
    smsgupshup,
    isProduction,
  } = require('../../admin/env');

  const smsContext = change.after.get('smsContext');

  // Profile doc is created and the smsContext object has been added to the profile doc.
  const toSendSMS = !change.before.data()
    && change.after.data()
    && smsContext;

  if (!toSendSMS) {
    return Promise.resolve();
  }

  // Will not send sms from test project
  if (!isProduction) {
    return Promise.resolve();
  }

  // Template substitutions allow 20 chars at most.
  const first20Chars = (str) => str.slice(0, 19);

  console.log('SMS Sent to:', change.after.id);

  const templatedMessage = (() => {
    const {
      activityName,
      creator,
      office,
    } = smsContext;

    const creatorName = (() => {
      if (creator === env.supportPhoneNumber) {
        return 'Growthfile Support';
      }

      return creator;
    })();

    return `${first20Chars(creatorName)} from ${first20Chars(office)} has`
      + ` created ${first20Chars(activityName)} and`
      + ` included you. Download ${downloadUrl} to view more details.`;
  })();

  // Profile doc id is the phone number
  const sendTo = change.after.id;
  const encodedMessage = `${encodeURI(templatedMessage)}`;
  const host = `enterprise.smsgupshup.com`;
  const path = `/GatewayAPI/rest?method=SendMessage`
    + `&send_to=${sendTo}`
    + `&msg=${encodedMessage}`
    + `&msg_type=TEXT`
    + `&userid=${smsgupshup.userId}`
    + `&auth_scheme=plain`
    + `&password=${smsgupshup.password}`
    + `&v=1.1`
    + `&format=text`;

  const params = {
    host,
    path,
    // HTTPS port is 443
    port: 443,
  };

  return new Promise(
    (resolve, reject) => {
      const req = https.request(params, (res) => {
        // reject on bad status
        console.log('res.statusCode', res.statusCode);

        if (res.statusCode > 226) {
          reject(new Error(`statusCode=${res.statusCode}`));

          return;
        }

        // cumulate data
        let chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));

        // resolve on end
        res.on('end', () => {
          chunks = Buffer.concat(chunks).toString();

          if (chunks.includes('error')) {
            reject(new Error(chunks));

            return;
          }

          resolve(chunks);
        });
      });

      // reject on request error
      // This is not a "Second reject", just a different sort of failure
      req.on('error', (err) => {
        console.log('in err');

        return reject(new Error(err));
      });

      // IMPORTANT
      req.end();
    })
    .then(console.log)
    .catch(console.error);
};


const purgeAddendum = (query, resolve, reject, count) =>
  query
    .get()
    .then((docs) => {
      count++;

      // When there are no documents left, we are done
      if (docs.size === 0) return 0;

      // Delete documents in a batch
      const batch = db.batch();

      docs.forEach((doc) => batch.delete(doc.ref));

      /* eslint-disable */
      return batch
        .commit()
        .then(() => docs.size);
      /* eslint-enable */
    })
    .then((deleteCount) => {
      /** All docs deleted */
      if (deleteCount === 0) return resolve(count);

      // Recurse on the next process tick, to avoid exploding the stack.
      return process
        .nextTick(() => purgeAddendum(query, resolve, reject, count));
    })
    .catch(reject);


const manageAddendum = (change) => {
  const oldFromValue = change.before.get('lastQueryFrom');
  const newFromValue = change.after.get('lastQueryFrom');
  /**
   * Both old and the new values should be available
   * None should be 0.
   * The newer value should be greater than the older
   * value.
   */
  if (!oldFromValue || !newFromValue || newFromValue <= oldFromValue) {
    return Promise.resolve();
  }

  const query = rootCollections
    .updates
    .doc(change.after.get('uid'))
    .collection('Addendum')
    .where('timestamp', '<', oldFromValue)
    .orderBy('timestamp')
    .limit(500);

  const count = 0;

  return new
    Promise(
      (resolve, reject) => purgeAddendum(query, resolve, reject, count)
    )
    .then((count) => console.log(`Rounds:`, count))
    .catch(console.error);
};


const handleSignUpAndInstall = (options) => {
  const promises = [];

  if (!options.hasSignedUp
    && !options.hasInstalled) {
    return Promise.resolve();
  }

  options
    .currentOfficesList
    .forEach((office) => {
      const promise = rootCollections
        .offices
        .where('office', '==', office)
        .limit(1)
        .get();

      promises.push(promise);
    });

  const momentToday = moment();

  return rootCollections
    .inits
    .where('report', '==', reportNames.DAILY_STATUS_REPORT)
    .where('date', '==', momentToday.date())
    .where('month', '==', momentToday.month())
    .where('year', '==', momentToday.year())
    .get()
    .then((snapShot) => {
      const docRef = (() => {
        if (snapShot.empty) {
          return rootCollections.inits.doc();
        }

        return snapShot.docs[0].ref;
      })();

      const installsToday = (() => {
        if (snapShot.empty) {
          return 1;
        }

        /**
         * Doc might be created by some other event, and
         * thus may not have the field `installsToday`.
         */
        return snapShot.docs[0].get('installsToday') || 1;
      })();

      options.batch.set(docRef, {
        installsToday,
        report: reportNames.DAILY_STATUS_REPORT,
        date: moment().date(),
        month: moment().month(),
        year: moment().year(),
      }, {
          merge: true,
        });

      return Promise
        .all(promises);
    })
    .then((snapShots) => {
      snapShots
        .forEach((snapShot) => {
          const doc = snapShot.docs[0];
          const officeName = doc.get('office');

          const data = {
            timestamp: Date.now(),
            activityData: {
              officeId: options.change.after.get('employeeOf')[officeName],
              office: officeName,
            },
            user: options.phoneNumber,
          };

          if (options.hasInstalled) {
            data.action = httpsActions.install;
          }

          if (options.hasSignedUp) {
            data.action = httpsActions.signup;
          }

          options
            .batch
            .set(doc
              .ref
              .collection('Addendum')
              .doc(), data);
        });

      return Promise.resolve();
    })
    .catch(console.error);
};


/**
 * Deletes the addendum docs from the `Updates/(uid)/Addendum` when the
 * `lastQueryFrom` changes in the `Profiles` doc of the user.
 *
 * @Path: `Profiles/(phoneNumber)`
 * @Trigger: `onWrite`
 *
 * @param {Object} change Contains snapshot of `old` and `new` doc in `context`.
 * @returns {Promise<Batch>} Firestore `Batch` object.
 */
module.exports = (change) => {
  const {
    before,
    after,
  } = change;

  /** Only for debugging */
  if (!after.data()) {
    return Promise.resolve();
  }

  const batch = db.batch();
  const profileCreated = Boolean(!before.data() && after.data() && after.get('uid'));
  const phoneNumber = after.id;
  const oldOfficesList = Object.keys(before.get('employeeOf') || {});
  const currentOfficesList = Object.keys(after.get('employeeOf') || {});
  const newOffice = currentOfficesList
    .filter((officeName) => !oldOfficesList.includes(officeName))[0];
  const removedOffice = oldOfficesList
    .filter((officeName) => !currentOfficesList.includes(officeName))[0];
  /**
   * The uid was `undefined` or `null` in the old state, but is available
   * after document `onWrite` event.
   */
  const hasSignedUp = Boolean(!before.get('uid') && after.get('uid'));
  // const authDeleted = Boolean(before.get('uid') && !after.get('uid'));
  /** This can be `undefined` which will returned as `false`. */
  const hasBeenRemoved = Boolean(removedOffice);
  const hasBeenAdded = Boolean(newOffice);

  /**
   * If the `lastQueryFrom` value is `0`, the user probably has installed
   * the app for the first (or has been installing it multiple) time(s).
   * We log all these events to create an `install` report based on this data
   * for all the offices this person belongs to.
   */
  const hasInstalled = Boolean(
    before.get('lastQueryFrom')
    && before.get('lastQueryFrom') !== 0
    && after.get('lastQueryFrom') === 0
  );

  const options = {
    change,
    profileCreated,
    phoneNumber,
    newOffice,
    removedOffice,
    currentOfficesList,
    oldOfficesList,
    hasSignedUp,
    // authDeleted,
    hasInstalled,
    hasBeenRemoved,
    hasBeenAdded,
    batch,
    today: new Date(),
  };

  /**
   * What this code does...
   *
   * If has installed
   *    For each office create installs doc.
   * If has been added (to an office)
   *    For each office (added) created sign up docs with `addedOn` field
   * If uid written
   *    For each office (current) create sign up doc with `signedUpOn` field
   * Delete addendum if new `lastFromQuery` > old `lastFromQuery`.
   */
  // return handleSignUp(change, options)
  // .then(() => handleInstall(change, options))
  // .then(() => handleRemovedFromOffice(change, options))
  // .then(() => handleAddedToOffice(change, options))
  return Promise
    .resolve()
    .then(() => handleSignUpAndInstall(options))
    .then(() => manageAddendum(change))
    .then(() => options.batch.commit())
    // .then(() => sendSMS(change))
    .catch(console.error);
};
