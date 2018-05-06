const {
  rootCollections,
} = require('../../admin/admin');

const {
  handleError,
  sendResponse,
} = require('../../admin/utils');

const {
  isValidDate,
  isValidLocation,
  isValidString,
} = require('./helperLib');

const {
  activities,
  profiles,
  updates,
  activityTemplates,
} = rootCollections;


const fetchSubscriptions = (conn, jsonResult) => {
  Promise.all(conn.templatesList).then((snapShot) => {
    snapShot.forEach((doc) => {
      if (doc.exists) {
        // template name: doc.ref.path.split('/')[1])
        jsonResult.templates[doc.ref.path.split('/')[1]] = {
          schedule: doc.get('schedule'),
          venue: doc.get('venue'),
          template: doc.get('defaultTitle'),
          comment: doc.get('comment'),
          status: doc.get('statusOnCreate'),
        };
      }
    });

    conn.headers['Content-Type'] = 'application/json';
    conn.res.writeHead(200, conn.headers);
    conn.res.end(JSON.stringify(jsonResult));

    return;
  }).catch((error) => handleError(conn, error));
};


const getTemplates = (conn, jsonResult) => {
  profiles.doc(conn.requester.phoneNumber).collection('Subscriptions')
    .where('timestamp', '>=', new Date(conn.req.query.from))
    .get().then((snapShot) => {
      conn.templatesList = [];

      snapShot.forEach((doc) => {
        conn.templatesList
          .push(activityTemplates.doc(doc.get('template')).get());
      });

      fetchSubscriptions(conn, jsonResult);
      return;
    }).catch((error) => handleError(conn, error));
};

const fetchAssignToUsers = (conn, jsonResult) => {
  Promise.all(conn.assignToFetchPromises).then((snapShotsArray) => {
    let activityObj;

    snapShotsArray.forEach((snapShot) => {
      snapShot.forEach((doc) => {
        // activity-id --> doc.ref.path.split('/')[1]
        activityObj = jsonResult.activities[doc.ref.path.split('/')[1]];
        activityObj.assignTo.push(doc.id);
      });
    });

    getTemplates(conn, jsonResult);
    return;
  }).catch((error) => handleError(conn, error));
};

const fetchActivities = (conn, jsonResult) => {
  Promise.all(conn.activityFetchPromises).then((snapShot) => {
    let activityObj;
    snapShot.forEach((doc) => {
      // activity-id --> doc.ref.path.split('/')[1]
      activityObj = jsonResult.activities[doc.ref.path.split('/')[1]];

      activityObj.status = doc.get('status');
      activityObj.schedule = doc.get('schedule');
      activityObj.venue = doc.get('venue');
      activityObj.timestamp = doc.get('timestamp');
      activityObj.template = doc.get('template');
      activityObj.title = doc.get('title');
      activityObj.description = doc.get('description');
      activityObj.office = doc.get('office');
      activityObj.assignTo = [];
    });

    fetchAssignToUsers(conn, jsonResult);
    return;
  }).catch((error) => handleError(conn, error));
};

const getActivityIdsFromProfileCollection = (conn, jsonResult) => {
  conn.activityFetchPromises = [];
  conn.assignToFetchPromises = [];

  profiles.doc(conn.requester.phoneNumber).collection('Activities')
    .where('timestamp', '>=', new Date(conn.req.query.from)).get()
    .then((snapShot) => {
      snapShot.forEach((doc) => {
        conn.activityFetchPromises.push(activities.doc(doc.id).get());
        conn.assignToFetchPromises
          .push(activities.doc(doc.id).collection('AssignTo').get());

        jsonResult.activities[doc.id] = {};
        jsonResult.activities[doc.id]['canEdit'] = doc.get('canEdit');
      });

      fetchActivities(conn, jsonResult);
      return;
    }).catch((error) => handleError(conn, error));
};

/**
 * Fetches the addendums and adds them to a a temporary object in memory.
 *
 * @param {Object} conn Contains Express' Request and Respone objects.
 */
const readAddendumsByQuery = (conn) => {
  const jsonResult = {};

  jsonResult.addendum = [];
  jsonResult.activities = {};
  jsonResult.templates = {};
  jsonResult.from = {};
  jsonResult.upto = {};

  updates.doc(conn.requester.uid).collection('Addendum')
    .where('timestamp', '>=', new Date(conn.req.query.from))
    .orderBy('timestamp', 'asc').get().then((snapShot) => {
      snapShot.forEach((doc) => {
        jsonResult.addendum.push({
          activityId: doc.get('activityId'),
          comment: doc.get('comment'),
          timestamp: doc.get('timestamp'),
          location: [
            doc.get('location')._latitude,
            doc.get('location')._longitude,
          ],
          user: doc.get('user'),
        });
      }); // forEach end

      jsonResult.from = new Date(conn.req.query.from);
      jsonResult.upto = jsonResult.from;

      if (!snapShot.empty) {
        jsonResult.upto = snapShot.docs[snapShot.size - 1].get('timestamp');
      }

      getActivityIdsFromProfileCollection(conn, jsonResult);
      return;
    }).catch((error) => handleError(conn, error));
};

const app = (conn) => {
  if (!isValidDate(conn.req.query.from)) {
    sendResponse(conn, 400, 'BAD REQUEST');
    return;
  }

  readAddendumsByQuery(conn);
};

module.exports = app;
