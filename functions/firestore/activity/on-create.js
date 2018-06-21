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
  rootCollections,
  getGeopointObject,
  db,
} = require('../../admin/admin');

const {
  activities,
  profiles,
  updates,
  activityTemplates,
  offices,
  dailyActivities,
} = rootCollections;

const {
  handleError,
  sendResponse,
} = require('../../admin/utils');

const {
  code,
} = require('../../admin/responses');

const {
  handleCanEdit,
  isValidDate,
  isValidString,
  isValidPhoneNumber,
  isValidLocation,
  filterSchedules,
  filterVenues,
  attachmentCreator,
} = require('./helper');


/**
 * Commits the batch and sends a response to the client.
 *
 * @param {Object} conn Contains Express' Request and Response objects.
 * @returns {Promise} Doc metadata or error object.
 */
const commitBatch = (conn) => conn.batch.commit()
  .then(() => sendResponse(
    conn,
    code.created,
    'The activity was successfully created.'
  )).catch((error) => handleError(conn, error));


/**
 * Adds docs for each assignee of the activity to the batch.
 *
 * @param {Object} conn Contains Express' Request and Response objects.
 * @returns {void}
 */
const handleAssignedUsers = (conn) => {
  /** @constant promises List of promises. */
  const promises = [];

  /**
   * Create docs in Assignees collection if share is in the request body.
   * */
  conn.req.body.share.forEach((val) => {
    if (!isValidPhoneNumber(val)) return;

    conn.batch.set(
      activities
        .doc(conn.activityRef.id)
        .collection('Assignees')
        .doc(val), {
        canEdit: handleCanEdit(
          conn.data.subscription,
          val,
          conn.requester.phoneNumber,
          conn.req.body.share
        ),
      }, {
        merge: true,
      });

    /** The phone numbers exist uniquely in the `/Profiles` collection. */
    promises.push(profiles.doc(val).get());

    conn.batch.set(
      profiles
        .doc(val)
        .collection('Activities')
        .doc(conn.activityRef.id), {
        canEdit: handleCanEdit(
          conn.data.subscription,
          val,
          conn.requester.phoneNumber,
          conn.req.body.share
        ),
        timestamp: new Date(conn.req.body.timestamp),
      });
  });

  Promise.all(promises).then((snapShots) => {
    /** The doc exists inside `Profiles` collection. */
    snapShots.forEach((doc) => {
      if (!doc.exists) {
        /** Create profiles for the phone numbers which are not in the DB. */
        conn.batch.set(profiles.doc(doc.id), {
          uid: null,
        });

        conn.batch.set(
          profiles
            .doc(doc.id)
            .collection('Activities')
            .doc(conn.activityRef.id), {
            canEdit: handleCanEdit(
              conn.data.subscription,
              doc.id,
              conn.requester.phoneNumber,
              conn.req.body.share
            ),
            timestamp: new Date(conn.req.body.timestamp),
          });
      }

      /** The `uid` shouldn't be `null` OR `undefined` */
      if (doc.exists && doc.get('uid')) {
        conn.batch.set(
          updates
            .doc(doc.get('uid'))
            .collection('Addendum')
            .doc(),
          conn.addendumData
        );
      }
    });

    commitBatch(conn);
    return;
  }).catch((error) => handleError(conn, error));
};


/**
 * Adds activity root doc to batch.
 *
 * @param {Object} conn Object containing Express Request and Response objects.
 * @returns {void}
 */
const createActivity = (conn) => {
  const root = {};
  root.title = conn.req.body.title || '';

  if (typeof conn.req.body.description !== 'string') {
    root.description = '';
  }

  if (typeof conn.req.body.title !== 'string'
    && typeof conn.req.body.description === 'string') {
    root.title = conn.req.body.description.substring(0, 30);
  }

  if (root.title === '') {
    root.tile = conn.data.template.defaultTitle;
  }

  root.status = conn.data.template.statusOnCreate;
  root.office = conn.req.body.office;
  root.template = conn.req.body.template;

  root
    .schedule = filterSchedules(
      conn.req.body.schedule,
      /** The `schedule` object from the template. */
      conn.data.template.schedule
    );

  root
    .venue = filterVenues(
      conn.req.body.venue,
      /** The `venue` object from the template. */
      conn.data.template.venue
    );

  root.timestamp = new Date(conn.req.body.timestamp);

  /** The docRef is the reference to the document which the
    * activity handled in the request. It will ne null for an
    * activity with the template 'plan' with office 'personal'.
    */

  root.docRef = conn.docRef || null;

  /** The rule is stored here to avoid reading subscriptions during
   * updates.
   */
  root.canEditRule = conn.data.subscription.canEditRule;

  conn.batch.set(conn.activityRef, root);

  conn.addendumData = {
    activityId: conn.activityRef.id,
    user: conn.requester.displayName || conn.requester.phoneNumber,
    comment: `${conn.requester.displayName || conn.requester.phoneNumber}` +
      ` created ${conn.data.template.defaultTitle}`,
    location: getGeopointObject(conn.req.body.geopoint),
    timestamp: new Date(conn.req.body.timestamp),
  };

  /** The addendum doc is always created for the requester */
  conn.batch.set(
    updates
      .doc(conn.requester.uid)
      .collection('Addendum')
      .doc(),
    conn.addendumData
  );

  /** The 'include' array will always have the requester's
   * phone number, so we don't need to explictly add their number
   * in order to add them to a batch.
   */
  conn.data.subscription.include.forEach((val) => {
    conn.batch.set(
      activities
        .doc(conn.activityRef.id)
        .collection('Assignees')
        .doc(val), {
        canEdit: handleCanEdit(
          conn.data.subscription,
          val,
          conn.requester.phoneNumber,
          conn.req.body.share
        ),
      });
  });

  conn.batch.set(
    profiles
      .doc(conn.requester.phoneNumber)
      .collection('Activities')
      .doc(conn.activityRef.id), {
      canEdit: handleCanEdit(
        conn.data.subscription,
        /** The phone Number to check and the one with which we are
         * going to verify the edit rule with are same because this
         * block is writing the doc for the user themselves.
         */
        conn.requester.phoneNumber,
        conn.requester.phoneNumber,
        conn.req.body.share
      ),
      timestamp: new Date(conn.req.body.timestamp),
    });

  if (Array.isArray(conn.req.body.share)) {
    handleAssignedUsers(conn);
    return;
  }

  commitBatch(conn);
};


/**
 * Creates a doc inside `/Profiles/(phoneNumber)/Map` for tracking location
 * history of the user.
 *
 * @param {Object} conn Contains Express' Request and Response objects.
 * @returns {void}
 */
const logLocation = (conn) => {
  conn.batch.set(
    profiles
      .doc(conn.requester.phoneNumber)
      .collection('Map')
      .doc(), {
      geopoint: getGeopointObject(conn.req.body.geopoint),
      timestamp: new Date(conn.req.body.timestamp),
      office: conn.req.body.office,
      template: conn.req.body.template,
    });

  createActivity(conn);
};


/**
 * Adds a doc in `/DailyActivities` collection in the path:
 * `/(office name)/(template name)` with the user's phone number,
 * timestamp of the request and the api used.
 *
 * @param {Object} conn Contains Express' Request and Response objects.
 * @returns {void}
 */
const updateDailyActivities = (conn) => {
  const date = new Date();
  const data = {
    phoneNumber: conn.requester.phoneNumber,
    url: conn.req.url,
    timestamp: date,
    activityId: conn.activityRef.id,
  };

  conn.batch.set(
    dailyActivities
      .doc(date.toDateString())
      .collection(conn.req.body.office)
      .doc(conn.req.body.template),
    data
  );

  logLocation(conn);
};


/**
 * Adds subscription to the user's profile based on the request body.
 *
 * @param {Object} conn Object containing Express Request and Response objects.
 * @returns {void}
 */
const createSubscription = (conn) => {
  conn.docRef = profiles
    .doc(conn.requester.phoneNumber)
    .collection('Subscriptions')
    .doc();

  const tempDoc = {};

  const attachment = attachmentCreator(
    conn.req.body.attachment,
    conn.data.template.attachment
  );

  /** Add `ALL` fields from the `attachment` to the subscription document. */
  Object
    .keys(attachment)
    .forEach((key) => tempDoc[`${key}`] = attachment[`${key}`]);

  const schedule = filterSchedules(
    conn.req.body.schedule,
    /** The `schedule` object from the template. */
    conn.data.template.schedule
  )[0]; /** Only one schedule is required. */

  const venue = filterVenues(
    conn.req.body.venue,
    /** The `venue` object from the template. */
    conn.data.template.venue
  )[0]; /** Only one venue is required. */

  tempDoc[`${schedule.name}`] = {
    startTime: schedule.startTime,
    endTime: schedule.endTime,
  };

  tempDoc[`${venue.venueDescriptor}`] = {
    address: venue.address,
    location: venue.location,
    geopoint: getGeopointObject(venue.geopoint),
  };

  tempDoc.status = conn.data.template.statusOnCreate;
  tempDoc.office = conn.req.body.office;

  conn.batch.set(conn.docRef, tempDoc);

  updateDailyActivities(conn);
};


/**
 * Creates a new document inside Office root collection based on the
 * attachment, template, and the request body.
 *
 * @param {Object} conn Object containing Express Request and Response objects.
 * @returns {void}
 */
const createCompany = (conn) => {
  conn.docRef = offices.doc(conn.activityRef.id);

  const tempDoc = {};

  const attachment = attachmentCreator(
    conn.req.body.attachment,
    conn.data.template.attachment
  );

  /** Add `ALL` fields from attachment to the company (office) document. */
  Object
    .keys(attachment)
    .forEach((key) => tempDoc[`${key}`] = attachment[`${key}`]);

  tempDoc.name = conn.req.body.office;

  const schedule = filterSchedules(
    conn.req.body.schedule,
    /** The `schedule` object from the template. */
    conn.data.template.schedule
  )[0]; /** Only one schedule is required. */

  const venue = filterVenues(
    conn.req.body.venue,
    /** The `venue` object from the template. */
    conn.data.template.venue
  )[0]; /** Only one venue is required. */

  tempDoc[`${schedule.name}`] = {
    startTime: schedule.startTime,
    endTime: schedule.endTime,
  };

  tempDoc[`${venue.venueDescriptor}`] = {
    address: venue.address,
    location: venue.location,
    geopoint: getGeopointObject(venue.geopoint),
  };

  tempDoc.status = conn.data.template.statusOnCreate;
  tempDoc.name = conn.req.body.office;
  /** Template field is set in office. */
  tempDoc.template = conn.req.body.template;

  conn.batch.set(conn.docRef, tempDoc);

  updateDailyActivities(conn);
};


/**
 * Creates a new document inside the specified Office from the
 * attachment based on the attachment, template and, the request body.
 *
 * @param {Object} conn Object containing Express Request and Response objects.
 * @returns {void}
 */
const addNewEntityInOffice = (conn) => {
  /** Office ID: conn.data.office.docs[0].id */
  conn.docRef = offices
    .doc(conn.data.office.docs[0].id)
    /** Collection names are `ALWAYS` plural. */
    .collection(`${conn.req.body.template}s`)
    .doc(conn.activityRef.id);

  const tempDoc = {};

  const attachment = attachmentCreator(
    conn.req.body.attachment,
    conn.data.template.attachment
  );

  /** Add `ALL` fields from attachment to the company (office) document. */
  Object
    .keys(attachment)
    .forEach((key) => tempDoc[`${key}`] = attachment[`${key}`]);

  tempDoc.name = conn.req.body.office;

  const schedule = filterSchedules(
    conn.req.body.schedule,
    /** The `schedule` object from the template. */
    conn.data.template.schedule
  )[0]; /** Only one schedule is required. */

  const venue = filterVenues(
    conn.req.body.venue,
    /** The `venue` object from the template. */
    conn.data.template.venue
  )[0]; /** Only one venue is required. */

  tempDoc[`${schedule.name}`] = {
    startTime: schedule.startTime,
    endTime: schedule.endTime,
  };

  tempDoc[`${venue.venueDescriptor}`] = {
    address: venue.address,
    location: venue.location,
    geopoint: getGeopointObject(venue.geopoint),
  };

  tempDoc.status = conn.data.template.statusOnCreate;
  tempDoc.name = conn.req.body.office;
  /** Template field is set in office. */
  tempDoc.template = conn.req.body.template;

  conn.batch.set(conn.docRef, tempDoc);

  updateDailyActivities(conn);
};


/**
 * Checks the template and office combination and handles the request
 * based on that.
 *
 * @param {Object} conn Object containing Express Request and Response objects.
 * @returns {void}
 */
const processRequestType = (conn) => {
  /** A reference of the batch and the activity instance will be used
   * multiple times throughout the activity creation.
   */
  conn.activityRef = activities.doc();
  conn.batch = db.batch();

  if (conn.req.body.office === 'personal') {
    if (conn.req.body.template === 'plan') {
      updateDailyActivities(conn);
      return;
    }

    sendResponse(
      conn,
      code.badRequest,
      `This combination of office: ${conn.req.body.office} and`
      + ` template: ${conn.req.body.template} does not exist in`
      + ' your subscriptions.'
    );
    return;
  }

  if (!conn.data.office.empty) {
    sendResponse(
      conn,
      code.badRequest,
      `An office with the name: ${conn.req.body.office} does not exist.`
    );
    return;
  }

  /** For creating a subscription or company, an attachment is required. */
  if (!conn.req.body.hasOwnProperty('attachment')) {
    sendResponse(
      conn,
      code.badRequest,
      'Attachment is not present in the request body'
    );
    return;
  }

  if (conn.req.body.template === 'subscription') {
    createSubscription(conn);
    return;
  }

  if (conn.req.body.template === 'company') {
    createCompany(conn);
    return;
  }

  addNewEntityInOffice(conn);
};


/**
 * Adds the `canEditRule` from the request body to a temporary
 * object in `conn.data`.
 *
 * @param {Object} conn Object containing Express Request and Response objects.
 * @returns {void}
 */
const handleSupportRequest = (conn) => {
  /** For support requests, the canEditRule will be used from the
   * request body and not from the user's subscription.
   */
  conn.data.subscription.canEditRule = conn.req.body.canEditRule;
  processRequestType(conn);
};


/**
 * Fetches the template and the subscriptions of the requester form Firestore.
 *
 * @param {Object} conn Object containing Express Request and Response objects.
 * @returns {void}
 */
const fetchDocs = (conn) => {
  Promise.all([
    activityTemplates
      .where('name', '==', conn.req.body.template)
      .limit(1)
      .get(),
    profiles
      .doc(conn.requester.phoneNumber)
      .collection('Subscriptions')
      .where('template', '==', conn.req.body.template)
      .limit(1)
      .get(),
    offices
      .where('name', '==', conn.req.body.office)
      .limit(1)
      .get(),
  ]).then((result) => {
    /** Stores all the temporary data for creating the activity. */
    conn.data = {};

    /** A template with the name from the request body doesn't exist. */
    if (result[0].empty) {
      sendResponse(
        conn,
        code.badRequest,
        `Template: ${conn.req.body.template} does not exist.`
      );
      return;
    }

    conn.data.subscription = result[1].docs[0].data();
    conn.data.subscription.id = result[1].docs[0].id;
    conn.data.template = result[0].docs[0].data();
    /** Storing office as a reference when the office is not personal,
     * the data and its reference is required fof creating an office.
     */
    conn.data.office = result[2];

    /** Handle support requests from here. */
    if (conn.requester.isSupportRequest) {
      handleSupportRequest(conn);
      return;
    }

    if (result[1].empty) {
      /** The template with that field does not exist in the user's
       * subscriptions. This probably means that they are either
       * not subscribed to the template that they requested
       * to create the activity with, OR the template with
       * that name simply does not exist.
       */
      sendResponse(
        conn,
        code.forbidden,
        `A template with the name: ${conn.req.body.template}` +
        ' does not exist in your subscriptions.'
      );
      return;
    }

    if (result[1].docs[0].get('office') !== conn.req.body.office) {
      /** Template from the request body and the office do not match so,
       * the requester probably doesn't have the permission to create
       * an activity with this template.
       */
      sendResponse(
        conn,
        code.forbidden,
        'You do not have the permission to create' +
        ` an activity with the template: ${conn.req.body.template}.`
      );
      return;
    }

    processRequestType(conn);
    return;
  }).catch((error) => handleError(conn, error));
};


/**
 * Checks if the request body has `ALL` the *required* fields like `timestamp`,
 * `geopoint`, `office`, and the `template`.
 *
 * @param {Object} conn Object containing Express Request and Response objects.
 * @returns {void}
 */
const isValidRequestBody = (conn) => {
  if (isValidDate(conn.req.body.timestamp)
    && isValidString(conn.req.body.template)
    && isValidString(conn.req.body.office)
    && isValidLocation(conn.req.body.geopoint)
    && conn.req.body.template) {
    fetchDocs(conn);
    return;
  }

  sendResponse(
    conn,
    code.badRequest,
    'The request body does not have all the necessary fields with proper' +
    ' values. Please make sure that the timestamp, template, office' +
    ' and the geopoint are included in the request with appropriate values.'
  );
};


const verifyCanEditRuleFromRequestBody = (conn) => {
  if (!conn.req.body.hasOwnProperty('canEditRule')) {
    sendResponse(
      conn,
      code.badRequest,
      'The canEditRule is missing from the request body.'
    );
    return;
  }

  if ([
    'ALL',
    'NONE',
    'FROM_INCLUDE',
    'PEOPLE_TYPE',
    'CREATOR',
  ].indexOf(conn.req.body.canEditRule) === -1) {
    sendResponse(
      conn,
      code.badRequest,
      'The canEditRule is invalid in the request body.'
    );
    return;
  }

  isValidRequestBody(conn);
};


const app = (conn) => {
  if (conn.requester.isSupportRequest) {
    verifyCanEditRuleFromRequestBody(conn);
    return;
  }

  isValidRequestBody(conn);
};


module.exports = app;
