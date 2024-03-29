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
  db,
} = require('../../admin/admin');

let count = 0;

const updateMultiple = (query, resolve, reject, change) =>
  query
    .get()
    .then((docs) => {
      console.log('Docs found:', docs.size, 'Iteration:', count);

      if (docs.size === 0) return 0;

      const batch = db.batch();

      docs.forEach(doc => {
        const template = doc.get('template');
        const data = {
          timestamp: Date.now(),
          addendumDocRef: null,
        };

        if (template !== 'subscription') {
          data.attachment = Object.assign(doc.get('attachment'), change.after.get('attachment'));
        }

        batch.set(doc.ref, data, { merge: true });
      });

      /* eslint-disable */
      return batch
        .commit()
        .then(() => docs.docs[docs.size - 1]);
      /* eslint-enable */
    })
    .then(lastDoc => {
      if (!lastDoc) return resolve();

      count++;

      const template = lastDoc.get('template');

      const startAfter = (() => {
        if (template == 'subscription') {
          return lastDoc.get('attachment.Subscriber.value');
        }

        return require('firebase-admin').firestore.FieldPath.documentId();
      })();

      const newQuery = query.startAfter(startAfter);

      return process
        .nextTick(() => updateMultiple(newQuery, resolve, reject, change));
    })
    .catch(reject);


const updateActivities = change => {
  const templateName = change.after.get('name');

  if (templateName === 'check-in') return Promise.resolve();

  const query = rootCollections
    .activities
    .where('template', '==', change.after.get('name'))
    .limit(500);

  return new Promise((resolve, reject) => {
    return updateMultiple(query, resolve, reject, change);
  });
};


/**
 * Whenever a `Template Manager` updates a document in ActivityTemplates
 * collection, this function queries the `Activities` collection, gets
 * all the activities have subscribers of this activity and updates the
 * timestamp of the document's timestamp present in
 * `Profiles/(subscriberPhoneNumber)/Subscriptions/(activityId)`.
 *
 * @Path: `ActivityTemplates/{docId}`
 * @Trigger: `onUpdate`
 * @WritePath: `Profiles/(subscriberPhoneNumber)/Subscriptions/(activityId)`
 *
 * @param {Object} change Object containing doc snapShots (old and new).
 * @returns {Object<Batch>} Firebase Batch object.
 */
module.exports = change => {
  /** The template name never changes. */
  const templateName = change.after.get('name');
  const query =
    rootCollections
      .activities
      .where('template', '==', 'subscription')
      .where('attachment.Template.value', '==', templateName)
      .orderBy('attachment.Subscriber.value')
      .limit(500);

  console.log({ templateName });

  return new
    Promise((resolve, reject) => updateMultiple(query, resolve, reject))
    .then(() => console.log(`Iterations: ${count}`))
    // .then(() => updateActivities(change))
    .catch(console.error);
};
