# Sip.JS with Shared-Worker

- Here we are using reactjs with typescript for this test.
- To test the app.
- Click on the Register button, then click on call.
- Call will get connected and you can here echo from the voip server.
- For testing the reconnection, click on the Disconnect button then click on Reconnect.
- It will reconnect agian, here we are intentionally closing the peerconnection and reinviting again.
- In any senario like network change or bandwidth congestion RTCIceConnectionState change to failed icerestart will happen here.

Prerequisites
--------------
- Install [node](https://nodejs.org/en/download/)


Run the application
----------------------
- Clone the repo.
- ```  npm i   ```
- Add .env file for the configuration of the application.
- ```  npm start   ```
- Runs the app in the development mode.
- Open http://localhost:3000 to view it in your browser.



Build the application
----------------------
- Add .env file for the configuration of the application.
- ```  npm run build   ```
- Files will be available in the build folder.
- ```  npx http-server build   ```
- Runs the application.
- Open http://localhost:8080 to view it in your browser.