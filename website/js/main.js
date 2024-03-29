'use strict';

function handleRecaptcha(callbackFunction) {
  return new firebase.auth.RecaptchaVerifier('recaptcha-container', {
    'size': 'normal',
    callback: function (response) {
      if (typeof callbackFunction === 'function') {
        callbackFunction(response);
      }
    },
  });
}


function isValidPhoneNumber(phoneNumber = '') {
  const pattern = /^\+[0-9\s\-\(\)]+$/;

  return phoneNumber.search(pattern) !== -1;
}

function getParsedCookies() {
  const cookieObject = {};

  document
    .cookie
    .split(';')
    .forEach((cookie) => {
      const parts = cookie.split('=');

      cookieObject[parts.shift().trim()] = decodeURI(parts.join('='));
    });

  return cookieObject;

};

function isNonEmptyString(string) {
  return typeof string === 'string' && string.trim() !== '';
}

function insertAfterNode(currentNode, nodeToInsert) {
  currentNode.parentNode.insertBefore(nodeToInsert, currentNode.nextSibling);
}

function logoutUser(event) {
  event.preventDefault();

  /** User isn't logged in */
  if (!firebase.auth().currentUser) return;

  console.log('logging out user...');

  document.cookie = `__session=`;

  return firebase
    .auth()
    .signOut()
    .then(function () {
      window.location.reload();

      return;
    })
    .catch(console.error);
};

function getWarningNode(textContent) {
  // valid = false;

  const warningNode = document.createElement('span');
  warningNode.classList.add('warning-label');
  warningNode.textContent = textContent;

  return warningNode;
}

function getQueryString(field, url) {
  const href = url ? url : window.location.href;
  const reg = new RegExp('[?&]' + field + '=([^&#]*)', 'i');
  const string = reg.exec(href);

  return string ? string[1] : null;
}

function getMobileOperatingSystem() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;

  // Windows Phone must come first because its UA also contains "Android"
  if (/windows phone/i.test(userAgent)) {
    return 'Windows Phone';
  }

  if (/android/i.test(userAgent)) {
    return 'Android';
  }

  // iOS detection from: http://stackoverflow.com/a/9039885/177710
  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return 'iOS';
  }

  return 'unknown';
};

function isValidEmail(emailString) {
  return /^([A-Za-z0-9_\-\.])+\@([A-Za-z0-9_\-\.])+\.([A-Za-z]{2,4})$/
    .test(emailString);
}

function getSpinnerElement(id) {
  const elem = document.createElement('div');
  elem.className = 'spinner';
  elem.style.position = 'relative';
  elem.style.height = '40px';
  elem.style.width = '40px';

  if (id) {
    elem.id = id;
  }
  return {
    center: function () {
      elem.classList.add('spinner-center')
      return elem;
    },
    default: function () {
      return elem;
    }
  }

}

/** Create Modal box */
function createModal(actionContent) {
  if (document.getElementById('modal')) {
    // document.getElementById('modal').remove();
    setContentInModal(actionContent, document.querySelector('#modal .action-container'))
    return;
  };

  const div = document.createElement('div');
  div.className = 'modal';
  div.id = 'modal'


  const content = document.createElement('div')
  content.className = 'modal-content';

  const close = document.createElement('span')
  close.className = 'close fa fa-window-close'
  close.onclick = function () {
    div.remove();
  }
  content.appendChild(close)

  const actionContainer = document.createElement('div')
  actionContainer.className = 'action-container mt-10';
  const actionNotification = document.createElement('p');
  actionNotification.id = 'action-label'
  content.appendChild(actionNotification)
  setContentInModal(actionContent, actionContainer)
  content.appendChild(actionContainer);
  div.appendChild(content)
  return div;
}

function isDomElementString(el) {
  return typeof el == 'string';
}

function setContentInModal(el, parent) {
  console.log(el)
  console.log(parent);

  if (isDomElementString(el)) {
    parent.innerHTML = el;
  } else {
    parent.appendChild(el);
  }
}

function setMessage(message) {
  const messageNode = document.getElementById('message');
  messageNode.innerText = message;
  messageNode.classList.remove('hidden');
}


function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject('Geolocation is Not Supported')
    }

    navigator
      .geolocation
      .getCurrentPosition(function (position) {
        return resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        })
      });
  })
    .catch(function (error) {
      let message;
      switch (error.code) {
        case 1:
          message = 'Please Enable Location';
          break;
        default:
          message = error.message;
      }

      return reject(message);
    });
}


function sendApiRequest(apiUrl, requestBody = null, method = 'GET') {
  const init = {
    method,
    mode: 'cors',
    cache: 'no-cache',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (requestBody && init.method !== 'GET') {
    init.body = JSON.stringify(requestBody);
  }

  showProgressBar();

  return firebase
    .auth()
    .currentUser
    .getIdToken(false)
    .then(function (idToken) {
      init.headers.Authorization = `Bearer ${idToken}`;

      return fetch(apiUrl, init);
    })
    .then(function (result) {
      hideProgressBar();

      return result;
    })
    .catch(console.error);
}


document.addEventListener('click', (event) => {
  if (event.target === document.getElementById('form-submit-button')) {
    return void startOfficeCreationFlow(event)
  }

  if (event.target === document.getElementById('load-map-button')) {
    return getLocation()
      .then(initMap)
      .catch(function (message) {
        if (document.getElementById('map')) {
          document.getElementById('map').innerHTML = `<p style='text-align:center;margin-top:20px;' class='warning-label'>${message}</p>`
        }
      });
  }

  // TODO: Refactor this name. Not very unique and might cause conflicts.
  if (Array.from(document.querySelectorAll('.list-item')).includes(event.target)) {
    return void updateMapPointer(event);
  }

  if (event.target === document.querySelector('#header-hamburger-icon')) {
    document.querySelector('aside').classList.toggle('hidden');
  }

  if (event.target === document.getElementById('menu-logout-link')) {
    return void logoutUser(event);
  }
});

firebase
  .auth()
  .onAuthStateChanged(function (user) {
    if (user) return;

    document.cookie = `__session=`;

    console.log('no session cookie');
  });

function setGlobals() {
  const result = sessionStorage.getItem('__url_config');

  function attachKeysToWindow(result) {
    Object
      .keys(result)
      .forEach(function (key) { window[key] = result[key]; });
  }

  if (result) {
    const parsed = JSON.parse(result);

    return attachKeysToWindow(parsed);
  }

  return fetch('/config')
    .then(function (response) { return response.json() })
    .then(function (result) {
      sessionStorage.setItem('__url_config', JSON.stringify(result));

      attachKeysToWindow(result);
    })
    .catch(console.error);
}

function checkDnt() {
  const dntEnabled = navigator.doNotTrack === 1;

  console.log({ dntEnabled });
}

function addUnderlineToElement(elem) {
  elem.style.backgroundImage = 'linear-gradient(transparent, transparent 5px, #c9cacc 5px, #c9cacc)';
  elem.style.backgroundPosition = 'bottom';
  elem.style.backgroundSize = '100% 10px';
  elem.style.backgroundRepeat = 'repat-x';
}

function removeUnderlineFromElement(elem) {
  elem.style.background = 'unset';
}

function getPhoneNumber(id) {
  let result = `+${window.countryCode}${document.getElementById(id).value}`;

  if (result.startsWith(window.countryCode)) {
    result = result.replace(window.countryCode, '');
  }

  return result;
}

window.addEventListener('DOMContentLoaded', function () {
  firebase
    .auth()
    .addAuthTokenListener(function (idToken) {
      if (!idToken) {

        return;
      }

      document.cookie = `__session=${idToken};max-age=${idToken ? 3600 : 0};`;

      console.log('new cookie set', idToken);
    });
})

function storeEvent(event) {
  // Data is not set
  if (!window.__trackingData) {
    throw new Error('__trackingData not set.');
  }

  return sendApiRequest('/json?action=track-view', requestBody, 'POST')
    .then(function (result) { return result.json(); })
    .then(function (result) {
      console.log('track-view:', result);

      // Delte this data
      delete window.__trackingData;

      return;
    })
    .catch(console.error);
};

function handleTrackView() {
  if (!firebase.auth().currentUser) {
    return firebase
      .auth()
      .signInAnonymously()
      .then(function (user) {
        console.log('Anonymous:', user);

        return storeEvent(event);
      })
      .catch(console.error);
  }

  return storeEvent(event);
};

document.body.addEventListener('__trackView', handleTrackView);

const loginButton = document.getElementById('login-button');

if (loginButton) {
  loginButton.onclick = function () {
    window.location.href = '/auth';
  }
}

function showProgressBar() {
  const bar = document.getElementById('progressBar');

  bar.classList.add('visible');
}

function hideProgressBar() {
  const bar = document.getElementById('progressBar');

  bar.classList.remove('visible');
}

function getModal(options) {
  const title = options.title;

  const modalContainer = document.createElement('div');
  modalContainer.style.zIndex = '999';
  const modalDialog = document.createElement('div');
  modalDialog.classList.add('modal-dialog');
  modalDialog.classList.add('flexed-column', 'flexed-ai-center');
  const modalContent = document.createElement('div');
  modalContent.classList.add('modal-content');

  const modalHeader = document.createElement('div');
  modalHeader.style.padding = '24px 24px 0';
  modalHeader.classList.add('modal-header');
  modalHeader.classList.add('flexed-row');
  modalHeader.style.flexDirection = 'row';
  modalHeader.style.justifyContent = 'space-between';

  const modalTitle = document.createElement('h3');
  modalTitle.style.fontSize = '30px;';
  modalTitle.textContent = title;
  modalTitle.style.fontWeight = '800';
  const crossIcon = document.createElement('i');

  crossIcon.textContent = 'X';
  crossIcon.classList.add('close', 'cur-ptr');

  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(crossIcon);

  const modalBody = document.createElement('div');
  // modalBody.style.padding = '24px 24px 0';
  modalBody.style.maxHeight = '400px';
  modalBody.style.overflowY = 'auto';

  modalBody.appendChild(options.modalBodyElement);

  const modalFooter = document.createElement('div');
  modalFooter.style.padding = '10px';
  const closeButton = document.createElement('button');
  closeButton.textContent = 'CLOSE';
  closeButton.classList.add('mdc-button');

  function deleteModal() {
    document.body.style.overflowY = 'auto';
    modalContainer.remove();
  }

  closeButton.onclick = deleteModal;
  crossIcon.onclick = deleteModal;

  modalFooter.style.textAlign = 'right';
  modalFooter.appendChild(closeButton);

  const img = document.createElement('img');
  img.style.width = '100%';
  img.src = 'img/modal-hero.jpg';
  img.style.webkitFilter = 'grayscale(100%)';
  img.style.filter = 'grayscale(100%)';
  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modalContent.appendChild(modalFooter);
  modalDialog.appendChild(modalContent);
  modalContainer.appendChild(modalDialog);
  document.body.style.overflowY = 'hidden';

  return modalContainer;
}

setGlobals();
