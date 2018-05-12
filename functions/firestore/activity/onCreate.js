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


const {
  rootCollections,
  users,
  getGeopointObject,
  db,
} = require('../../admin/admin');

const {
  activities,
  profiles,
  updates,
  enums,
  activityTemplates,
  offices,
} = rootCollections;

const {
  handleError,
  sendResponse,
} = require('../../admin/utils');

const {
  handleCanEdit,
  isValidDate,
  isValidString,
  isValidPhoneNumber,
  isValidLocation,
  scheduleCreator,
  venueCreator,
  attachmentCreator,
} = require('./helperLib');


/**
 * Commits the batch and sends a response to the client.
 *
 * @param {Object} conn Contains Express' Request and Respone objects.
 * @param {Object} batch Firestore batch.
 */
const commitBatch = (conn, batch) => batch.commit()
  .then((result) => sendResponse(conn, 201, 'CREATED'))
  .catch((error) => handleError(conn, error));


/**
 * Adds docs for each assignee of the activity to the batch.
 *
 * @param {Object} conn Contains Express' Request and Respone objects.
 * @param {Object} result Contains the fetched documents from Firestore.
 */
const handleAssignedUsers = (conn, result) => {
  const promises = [];

  /** create docs in Assignees collection if assignees is in the
   * reqeuest body
   * */
  conn.req.body.assignees.forEach((val) => {
    if (!isValidPhoneNumber(val)) return;

    conn.batch.set(activities.doc(conn.activityRef.id)
      .collection('Assignees').doc(val), {
        /** template --> result[0] */
        canEdit: handleCanEdit(result[0].get('canEditRule')),
      }, {
        merge: true,
      });

    /** phone numbers exist uniquely in the db */
    promises.push(profiles.doc(val).get());

    conn.batch.set(profiles.doc(val).collection('Activities')
      .doc(conn.activityRef.id), {
        canEdit: handleCanEdit(result[0].get('canEditRule')),
        timestamp: new Date(conn.req.body.timestamp),
      });
  });

  Promise.all(promises).then((snapShots) => {
    /** doc exists inside /Profile collection */
    snapShots.forEach((doc) => {
      if (!doc.exists) {
        /** create profiles for the phone numbers which are not
         * in the database
         * */
        conn.batch.set(profiles.doc(doc.id), {
          uid: null,
        });

        conn.batch.set(profiles.doc(doc.id).collection('Activities')
          .doc(conn.activityRef.id), {
            canEdit: handleCanEdit(result[0].get('canEditRule')),
            timestamp: new Date(conn.req.body.timestamp),
          });
      }

      if (doc.exists && doc.get('uid') !== null) {
        conn.batch.set(updates.doc(doc.get('uid')).collection('Addendum')
          .doc(), conn.addendumData);
      }
    });

    commitBatch(conn, conn.batch);
    return;
  }).catch((error) => handleError(conn, error));
};

/**
 * Adds activity root doc to batch.
 *
 * @param {Object} conn Object containing Express Request and Response objects.
 * @param {Array} result Fetched docs from Firestore.
 */
const createActivity = (conn, result) => {
  conn.batch.set(conn.activityRef, {
    title: conn.req.body.title || conn.req.body.description
      .substring(0, 30) || result[0].get('defaultTitle'),
    description: conn.req.body.description || '',
    status: result[0].get('statusOnCreate'),
    office: conn.req.body.office,
    template: conn.req.body.template,
    schedule: scheduleCreator(
      conn.req.body.schedule,
      result[0].get('schedule')
    ),
    venue: venueCreator(
      conn.req.body.venue,
      result[0].get('venue')
    ),
    timestamp: new Date(conn.req.body.timestamp),
    attachment: attachmentCreator(conn.req.body.attachment),
    /** docRef is the the doc which the activity handled in the request */
    docRef: conn.officeChildDocRef,
  });

  conn.addendumData = {
    activityId: conn.activityRef.id,
    user: conn.requester.displayName || conn.requester.phoneNumber,
    comment: `${conn.requester.displayName || conn.requester.phoneNumber}
      created ${result[0].get('name')}`,
    location: getGeopointObject(
      conn.req.body.geopoint[0],
      conn.req.body.geopoint[1]
    ),
    timestamp: new Date(conn.req.body.timestamp),
  };

  /**
   * the include array will always have the requeter's
   * phone number, so we don't need to explictly add their number
   * in order to add them to a batch.
   */
  result[1].docs[0].get('include').forEach((val) => {
    conn.batch.set(activities.doc(conn.activityRef.id)
      .collection('Assignees').doc(val), {
        canEdit: handleCanEdit(result[0].get('canEditRule')),
      });
  });

  conn.batch.set(profiles.doc(conn.requester.phoneNumber)
    .collection('Activities').doc(conn.activityRef.id), {
      canEdit: handleCanEdit(result[0].get('canEditRule')),
      timestamp: new Date(conn.req.body.timestamp),
    });

  /** addendum doc is always created for the requester */
  conn.batch.set(updates.doc(conn.requester.uid)
    .collection('Addendum').doc(), conn.addendumData);

  Array.isArray(conn.req.body.assignees) ?
    handleAssignedUsers(conn, result) : commitBatch(conn);
};


const createSubscription = (conn, result) => {
  conn.batch.set(profiles.doc(conn.requester.phoneNumber)
    .collection('Subscriptions').doc(), {
      include: [conn.requester.phoneNumber],
      timestamp: new Date(conn.req.body.timestamp),
      template: result[1].docs[0].id,
      office: conn.req.body.office,
      activityId: conn.activityRef.id,
      status: 'CONFIRMED', // ??
    });

  createActivity(conn, result);
};


const createCompany = (conn, result) => {
  conn.batch.set(offices.doc(conn.req.body.office), {
    activityId: conn.activityRef.id,
    attachment: attachmentCreator(conn.req.body.attachment),
  });

  createActivity(conn, result);
};


const addNewEntityInOffice = (conn, result) => {
  conn.officeChildDocRef = office.doc(conn.req.body.office)
    .collection(conn.req.body.template).doc();

  conn.batch.set(conn.officeChildDocRef, {
    attachment: attachmentCreator(conn.req.body.attachment),
    schedule: scheduleCreator(conn.req.body.schedule),
    venue: venueCreator(conn.req.body.venue),
    activityId: conn.activityRef.id,
    status: 'PENDING',
  });

  createActivity(conn, result);
};


const processRequestType = (conn, result) => {
  /** reference of the batch and the activity instance will be used
   * multiple times throughout the activity creation */
  conn.activityRef = activities.doc();
  conn.batch = db.batch();

  if (conn.req.body.office === 'personal'
    && conn.req.body.template === 'plan') {
    createActivity(conn, result);
    return;
  }

  if (conn.req.body.office !== 'personal') {
    if (conn.req.body.template === 'subscription') {
      createSubscription(conn, result);
      return;
    }

    if (conn.req.body.template === 'company') {
      createCompany(conn, result);
      return;
    }
  }

  addNewEntityInOffice(conn, result);
};


/**
 * Fetches the template and the subscriptions of the requester form Firestore.
 *
 * @param {Object} conn Object containing Express Request and Response objects.
 */
const fetchDocs = (conn) => {
  const promises = [];

  promises.push(activityTemplates.where('name', '==', conn.req.body.template)
    .orderBy('name', 'asc').limit(1).get());
  promises.push(profiles.doc(conn.requester.phoneNumber)
    .collection('Subscriptions').where('template', '==', conn.req.body.template)
    .limit(1).get());

  Promise.all(promises).then((result) => {
    /** template sent in the request body is not a doesn't exist */
    if (!result[0].docs[0].exists) {
      sendResponse(conn, 400, `Template:
      ${conn.req.body.template} does not exist`);
      return;
    }

    if (!result[1].docs[0].exists
      /** checks if the requester has subscription to this activity */
      && result[1].docs[0].get('office') !== conn.req.body.office) {
      /** template from the request body and the office do not match
       * the requester probably doesn't have the permission to create
       * an activity with this template.
       */
      sendResponse(conn, 403, 'FORBIDDEN');
      return;
    }

    processRequestType(conn, result);
    return;
  }).catch((error) => handleError(conn, error));
};


const app = (conn) => {
  if (isValidDate(conn.req.body.timestamp)
    && isValidString(conn.req.body.template)
    && isValidString(conn.req.body.office)
    && isValidLocation(conn.req.body.geopoint)) {
    fetchDocs(conn);
    return;
  }

  sendResponse(conn, 400, 'BAD REQUEST');
};

module.exports = app;
