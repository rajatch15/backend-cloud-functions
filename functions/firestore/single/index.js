'use strict';


const {
  sendResponse,
  hasSupportClaims,
  disableAccount,
} = require('../../admin/utils');
const {
  code,
} = require('../../admin/responses');
const {
  isValidRequestBody,
} = require('../activity/helper');
const {
  httpsActions,
} = require('../../admin/constants');


module.exports = (conn) => {
  if (conn.req.method !== 'POST') {
    sendResponse(
      conn,
      code.methodNotAllowed,
      `${conn.req.method} is not allowed. Use 'POST'`
    );

    return;
  }

  const result =
    isValidRequestBody(conn.req.body, httpsActions.create);

  if (!result.isValid) {
    sendResponse(conn, code.badRequest, result.message);

    return;
  }

  if (conn.req.body.template === 'office') {
    if (!hasSupportClaims(conn.requester.customClaims)) {
      disableAccount(conn, 'You are not authorized to create Offices');

      return;
    }

    if (!conn.requester.isSupportRequest) {
      sendResponse(conn, code.forbidden, 'You do not have the permission to access this resource');

      return;
    }
  }

  if (conn.req.body.hasOwnProperty('activityId')) {
    require('./update')(conn);

    return;
  }

  require('./create')(conn);
};
