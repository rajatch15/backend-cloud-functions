# Cloud Functions for Growthfile



This is the repository for cloud functions running on Firebase Growthfile back-end



## Installation



* Download and install [Node 6.11.5](https://nodejs.org/download/release/v6.11.5/) on your device.



* Install firebase-tools and firebase-admin.



```bash

npm install -g firebase-tools firebase-admin

```



* Clone this repository



```bash

git clone https://github.com/Growthfilev2/backend-cloud-functions

```



*  `cd` into the functions directory.



```bash

cd backend-cloud-functions

```



* Install the dependencies



```bash

npm install

```



* Add the service account key from Firebase console to `/functions/admin/`



* Deploy the functions



```bash

firebase deploy --only functions

```



## Endpoints



There is a single endpoint which you can hit with your client in order to make a request.



```/api```



On this endpoint, you have resources which you can target depending on which type of request you want to make.



Listed below, are the main resources where you can hit your request.



*  `/api/activities`: contains action related to creating, updating and adding a comment to an activity.



*  `/api/services`: contains helper services like getting a contact from the database for the client.



*  `/api/now`: returns the server timestamp in a `GET` request.



## Sending Requests



* Using Javascript XHR



```javascript



var  data = JSON.stringify('/* JSON string here */');

var  url = '/* url endpoint here */';



var  xhr = new  XMLHttpRequest();

xhr.withCredentials = true;



xhr.addEventListener('readystatechange', () => {

if (this.readyState === 4) {

/* success */

console.log(this.responseText);

}

});



xhr.open('POST', url);

xhr.setRequestHeader('Content-Type', 'application/json');

/* https://firebase.google.com/docs/auth/admin/create-custom-tokens */

xhr.setRequestHeader('Authorization', '/* auth token string */');

xhr.setRequestHeader('Cache-Control', 'no-cache');

xhr.send(data);



```



* Using Javascript fetch



```javascript



const  url = '/* url endpoint here */';

const  body = {}; // add body data here



const  postData = (url, body) => {

return  fetch(url, {

body:  JSON.stringify(data),

cache:  'no-cache',

method:  'POST',

mode:  'cors',

headers: {

'Authorization':  'Bearer ' + getBearer(),

'Content-Type':  'application/json',

},

}).then((response) => {

return  response.json();

}).catch(console.log);

};



postData(url, body).then((data) => {

/* do something with json data */

});



```



## Getting a Unix Timestamp



* Javascript



* Current timestamp:



```javascript

const  ts = Date.now();

console.log(ts); // output --> 1527311424251

```



* Date timestamp



```javascript

const  ts = Date.parse(new  Date('DD MM YYYY'));

console.log(ts);

```



* Java



* Current timestamp



```java

final  long  ts = System.currentTimeMillis() / 1000L;

System.out.println(ts);

```



* Date timestamp



```java

final  String  dateString = "Fri, 09 Nov 2012 23:40:18 GMT";

final  DateFormat  dateFormat = new  SimpleDateFormat("EEE, dd MMM yyyy hh:mm:ss z");

final  Date  date = dateFormat.parse(dateString);

final  long  ts = (long) date.getTime() / 1000;

System.out.println(ts); // output --> 1527311424251

```






## Project setup

Install nodejs, npm and firebase
cmd for firebase: `npm install firebase-admin --save`

Create a project in it create a collection in cloud Firestore named with  `ActivityTemplates`
Copy all the live templates into that collection.
`Note`: use batch write for multiple templates

### Private key
Generate private key through=> In firebase console goto setting then service account.


Create a file `dev.json` in functions folder, copy key to dev.json

Edit variables in env.json
`databaseURL`: projectname.firebaseapp.com
`firebaseDomain`:'https://project.firebaseio.com'
`supportPhoneNumber`: add  your own contact  no.

Edit variable test in file `firebaserc`
`test`:(change to project name)

## Add auth in admin sdk
code
```
admin.auth().createUser({  email: 'user@example.com',  emailVerified: false,  phoneNumber: '+11234567890',  password: 'secretPassword',  displayName: 'John Doe',  photoURL: 'http://www.example.com/12345678/photo.png',  disabled: false})  .then(function(userRecord) {    // See the UserRecord reference doc for the contents of userRecord.    console.log('Successfully created new user:', userRecord.uid);  })  .catch(function(error) {    console.log('Error creating new user:', error);  });
```
`url`:[https://firebase.google.com/docs/auth/admin/manage-users](https://firebase.google.com/docs/auth/admin/manage-users)


### Custom claims

code
```
admin.auth().setCustomUserClaims(uid, {support: true}).then(() => {  // The new custom claims will propagate to the user's ID token the  // next time a new one is issued.});
```
`url`:[https://firebase.google.com/docs/auth/admin/manage-users](https://firebase.google.com/docs/auth/admin/manage-users)


### Create activities
Many http functions are there to create activities
#### office
This function create  4 docs in multiple collections
 `url` : http://localhost:5001/project-name/us-central1/api/admin/bulk?support=true

sample data body:

	{
	"template": "office",
    "timestamp": 1535183557515,
    "office": "TAJ",
    "geopoint": {
        "latitude": 28.5728858,
        "longitude": 77.2185796
    },
	"data":[{
		"Name":"TAJ",
		"Registered Office Address": "Agra",
		"Short Description":"",
		"Description":"",
		"Company Logo":"",
		"Usage":"",
		 "Youtube ID":"",
		  "GST Number":"",
		  "First Contact":"+919897224797",
		  "Second Contact":"",
		  "First Day Of Monthly Cycle":1,
		   "Branch Place Supported Types":"",
		   "Timezone":"Asia/Kolkata",
		   "Customer Place Supported Types":"",
		   "Date Of Establishment":"",
		   "Trial Period":""
		}
	]
	}



 #### customer
This function create  a customer of office.
`url` : http://localhost:5001/growth-f8e12/us-central1/api/activities/create?support=true

sample data body:

	{
	    "template": "customer",
	    "timestamp": 1530177932304,
	    "office": "TAJ",
	    "geopoint":{
	        "latitude": 28.5728858,
	        "longitude": 77.2185796
	    },
	    "share":[],
	    "schedule": [],
	    "venue": [
	     {
	     	 "venueDescriptor": "Customer Office",
	            "location": "lane 1",
	            "address": "",
	            "geopoint": {
	                "latitude": 28.548201,
	                "longitude": 77.2496963
	            }
	     }
	    ],
	    "attachment": {
	        "Name": {
	            "value": "abc",
	            "type": "string"
	        },
	        "First Contact": {
	            "value": "+919897224796",
	            "type": "phoneNumber"
	        },
	        "Second Contact": {
	            "value": "",
	            "type": "phoneNumber"
	        },
	        "Customer Type": {
	            "value": "",
	            "type": "customer-type"
	        },
	        "Customer Code": {
	            "value": "",
	            "type": "string"
	        },
	        "Daily Start Time": {
	            "value": "09:00",
	            "type": "HH:MM"
	        },
	        "Daily End Time": {
	            "value": "18:00",
	            "type": "HH:MM"
	        },
	        "Weekly Off": {
	            "value": "sunday",
	            "type": "weekday"
	        }
	    }
	}

## License

All the code and documentation is covered by the [MIT License](./LICENSE).
