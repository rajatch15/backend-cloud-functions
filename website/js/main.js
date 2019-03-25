firebase.initializeApp({
  apiKey: 'AIzaSyCadBqkHUJwdcgKT11rp_XWkbQLFAy80JQ',
  authDomain: 'growthfilev2-0.firebaseapp.com',
  databaseURL: 'https://growthfilev2-0.firebaseio.com',
  projectId: 'growthfilev2-0',
});

function signInFailure(error) {
  console.log('signin failed', error);
}

function uiShown() {
  console.log('ui was shown');
}

function handleResponse(response) {
  console.log(response);
};

function signInSuccessWithAuthResult(authResult, redirectUrl) {
  console.log('signin success');

  // document.querySelector('.modal').style.display = 'none';

  firebaseAuthModal.close();
};


const ui = new firebaseui.auth.AuthUI(firebase.auth());
const uiConfig = {
  signInOptions: [{
    provider: firebase.auth.PhoneAuthProvider.PROVIDER_ID,
    requireDisplayName: true,
    signInFlow: 'popup',
    recaptchaParameters: {
      type: 'image',
      size: 'invisible',
      badge: 'bottomleft',
    },
    defaultCountry: 'IN',
  }],
  tosUrl: 'https://growthfile.com/terms-of-service',
  privacyPolicyUrl: 'https://growthfile.com/privacy-policy',
  // https://github.com/firebase/firebaseui-web#example-with-all-parameters-used
  callbacks: {
    signInSuccessWithAuthResult,
    signInFailure,
    uiShown,
  },
};

function getMobileOperatingSystem() {
  var userAgent = navigator.userAgent || navigator.vendor || window.opera;

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

function getMobileOperatingSystem() {
  var userAgent = navigator.userAgent || navigator.vendor || window.opera;

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


function changeLink(event) {
  const ua = getMobileOperatingSystem();
  const playStoreLink =
    'https://play.google.com/store/apps/details?id=com.growthfile.growthfileNew';
  const appleStoreLink =
    'https://itunes.apple.com/in/app/growthfile/id1441388774?mt=8';

  if (ua === 'Android') {
    event.target.setAttribute('href', playStoreLink);
  }

  if (ua === 'iOS') {
    event.target.setAttribute('href', appleStoreLink);
  }

  return null;
};

document
  .querySelector('#download-app-link')
  .addEventListener('click', changeLink);

function showPicoModal(modalContent) {
  const myModal = picoModal(modalContent);

  myModal.show();
};