const {
  getGeopointObject,
  rootCollections,
} = require('../../admin/admin');

const {
  activityTemplates,
} = rootCollections;

const {
  code,
} = require('../../admin/responses');

const {
  validateSchedule,
  validateVenue,
} = require('./helpers');


const {
  handleError,
  sendResponse,
} = require('../../admin/utils');


const createTemplate = (conn, data) => {
  activityTemplates.doc().set(data).then(() => {
    sendResponse(
      conn,
      code.created,
      'The template was created successfully.'
    );
    return;
  }).catch((error) => handleError(conn, error));
};


const createTemplateObject = (conn) => {
  const data = {
    comment: conn.req.body.comment,
    name: conn.req.body.name,
    defaultTitle: conn.req.body.defaultTitle,
    venue: {
      address: conn.req.body.venue.address,
      geopoint: getGeopointObject(conn.req.body.venue.geopoint),
      location: conn.req.body.venue.location,
      venueDescriptor: conn.req.body.venue.venueDescriptor,
    },
    schedule: {
      name: conn.req.body.schedule.name,
      startTime: new Date(conn.req.body.schedule.startTime),
      endTime: new Date(conn.req.body.schedule.endTime),
    },
    attachment: conn.req.body.attachment,
  };

  createTemplate(conn, data);
};


const getTemplateByName = (conn) => {
  activityTemplates.where('name', '==', conn.req.body.name).limit(1)
    .get().then((snapShot) => {
      if (!snapShot.empty) {
        sendResponse(
          conn,
          code.conflict,
          `A template with the name: "${conn.req.body.name}" already exists.`
        );
        return;
      }

      createTemplateObject(conn);
      return;
    }).catch((error) => handleError(conn, error));
};


const app = (conn) => {
  /** true for empty string. */
  const re = /^$|\s+/;

  if (!re.test(conn.req.body.name)) {
    sendResponse(conn, code.badRequest, 'The "name" is invalid/missing');
    return;
  }

  if (conn.req.body.name === 'plan') {
    sendResponse(
      conn,
      code.forbidden,
      'You cannot update the template "plan".'
    );
    return;
  }

  if (!re.test(conn.req.body.defaultTitle)) {
    sendResponse(
      conn,
      code.badRequest,
      'The "defaultTitle" is invalid/missing'
    );
    return;
  }

  if (!re.test(conn.req.body.comment)) {
    sendResponse(conn, code.badRequest, 'The "comment" is invalid/missing');
    return;
  }

  if (Object.prototype.toString
    .call(conn.req.body.attachment) !== '[object Object]') {
    sendResponse(
      conn,
      code.badRequest,
      'The "attachment" in invalid/missing'
    );
    return;
  }

  if (Object.prototype.toString
    .call(conn.req.body.schedule) !== '[object Object]') {
    sendResponse(
      conn,
      code.badRequest,
      'The "schedule" is missing/invalid'
    );
    return;
  }

  if (Object.prototype.toString
    .call(conn.req.body.venue) !== '[object Object]') {
    sendResponse(
      conn,
      code.badRequest,
      'The "venue" is invalid/missing'
    );
    return;
  }

  if (!validateSchedule(conn.req.body.schedule)) {
    sendResponse(
      conn,
      code.badRequest,
      'The "schedule" object is invalid'
    );
    return;
  }

  if (!validateVenue(conn.req.body.venue)) {
    sendResponse(
      conn,
      code.badRequest,
      'The "venue" object is invalid'
    );
    return;
  }

  getTemplateByName(conn);
};


module.exports = app;