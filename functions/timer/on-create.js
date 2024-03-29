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


const {
  db,
  rootCollections,
} = require('../admin/admin');
const {
  reportNames,
} = require('../admin/constants');
const moment = require('moment');
const env = require('../admin/env');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(env.sgMailApiKey);



const sendErrorReport = () => {
  const {
    dateFormats,
  } = require('../admin/constants');
  const momentTz = require('moment-timezone');

  const today = momentTz().subtract(1, 'days');

  const getHTMLString = (doc, index) => {
    return `
    <h2>${index + 1}. Error message: ${doc.get('message')} | ${doc.id}</h2>
    <h3>First Occurrance: ${doc.createTime.toDate()}</h3>
    <h3>Last Occurrance: ${doc.updateTime.toDate()}</h3>
    <h3>Affected Users</h3>
    <p>${Object.keys(doc.get('affectedUsers'))}</p>
    <h3>Error Body</h3>
    <p><pre>${JSON.stringify(doc.get('bodyObject'), ' ')}</pre></p>
    <h3>Error Device</h3>
    <p><pre>${JSON.stringify(doc.get('deviceObject'), ' ')}</pre></p>
    <hr>`;
  };

  return rootCollections
    .errors
    .where('date', '==', today.date())
    .where('month', '==', today.month())
    .where('year', '==', today.year())
    .get()
    .then((snapShot) => {
      if (snapShot.empty) {
        // No errors yesterday
        return Promise.resolve();
      }

      let messageBody = '';
      let index = 0;

      snapShot.docs.forEach((doc) => {
        if (doc.get('skipFromErrorReport')) return;

        messageBody += `${getHTMLString(doc, index)}\n\n`;

        index++;
      });

      const subject = `${process.env.GCLOUD_PROJECT}`
        + ` Frontend Errors ${today.format(dateFormats.DATE)}`;

      const sgMail = require('@sendgrid/mail');
      const env = require('../admin/env');
      sgMail.setApiKey(env.sgMailApiKey);

      return sgMail.send({
        subject,
        to: env.instantEmailRecipientEmails,
        from: { name: 'Growthile', email: env.systemEmail },
        html: messageBody,
      });
    })
    .catch(console.error);
};

// const runQuery = (query, resolve, reject) => {
//   return query
//     .get()
//     .then((docs) => {
//       if (docs.empty) {
//         return 0;
//       }

//       const batch = db.batch();

//       docs.forEach((doc) => {
//         const scheduleArray = doc.get('schedule');

//         batch.set(doc.ref, {
//           addendumDocRef: null,
//           relevantTime: getRelevantTime(scheduleArray),
//         }, {
//             merge: true,
//           });
//       });

//       /* eslint-disable */
//       return batch
//         .commit()
//         .then(() => docs.docs[docs.size - 1]);
//       /* eslint-enable */
//     })
//     .then((lastDoc) => {
//       if (!lastDoc) return resolve();

//       return process
//         .nextTick(() => {
//           const newQuery = query
//             // Using greater than sign because we need
//             // to start after the last activity which was
//             // processed by this code otherwise some activities
//             // might be updated more than once.
//             .where(fieldPath, '>', lastDoc.id);

//           return runQuery(newQuery, resolve, reject);
//         });
//     })
//     .catch(reject);
// };

// const handleRelevantTime = () => {
//   const start = momentTz()
//     .subtract('1', 'day')
//     .startOf('day')
//     .valueOf();
//   const end = momentTz()
//     .subtract('1', 'day')
//     .endOf('day')
//     .valueOf();

//   const query = rootCollections
//     .activities
//     .where('relevantTime', '>=', start)
//     .where('relevantTime', '<=', end)
//     .orderBy(fieldPath)
//     .limit(250);

//   return new Promise((resolve, reject) => {
//     return runQuery(query, resolve, reject);
//   });
// };

module.exports = (timerDoc) => {
  if (timerDoc.get('sent')) {
    // Helps to check if email is sent already.
    // Cloud functions sometimes trigger multiple times
    // For a single write.
    return Promise.resolve();
  }

  return timerDoc
    .ref
    .set({
      sent: true,
    }, {
        merge: true,
      })
    .then(() => {
      const messages = [];

      env
        .instantEmailRecipientEmails
        .forEach((email) => {
          const html = `<p>Date (DD-MM-YYYY): ${timerDoc.id}</p>
<p>Timestamp: ${new Date(timerDoc.get('timestamp')).toJSON()}</p>`;

          messages.push({
            html,
            cc: '',
            subject: 'FROM Timer function',
            to: email,
            from: {
              name: 'Growthfile',
              email: env.systemEmail,
            },
          });
        });

      return sgMail.sendMultiple(messages);
    })
    .then(() => sendErrorReport())
    .then(() => {
      const momentYesterday = moment()
        .subtract(1, 'day')
        .startOf('day');

      return Promise
        .all([
          rootCollections
            .recipients
            .get(),
          rootCollections
            .inits
            .where('report', '==', reportNames.DAILY_STATUS_REPORT)
            .where('date', '==', momentYesterday.date())
            .where('month', '==', momentYesterday.month())
            .where('year', '==', momentYesterday.year())
            .limit(1)
            .get(),
        ]);
    })
    .then((result) => {
      const [
        recipientsQuery,
        counterDocsQuery,
      ] = result;

      const batch = db.batch();

      recipientsQuery
        .forEach((doc) => {
          batch.set(doc.ref, {
            timestamp: Date.now(),
          }, {
              merge: true,
            });
        });

      batch.set(counterDocsQuery.docs[0].ref, {
        /**
         * Storing this value in the daily status report counts doc in order
         * to check if all reports have finished their work.
         */
        expectedRecipientTriggersCount: recipientsQuery.size,
        recipientsTriggeredToday: 0,
      }, {
          merge: true,
        });

      return batch.commit();
    })
    .catch(console.error);
};
