# gve_devnet_webex_shared_timer
The goal is to create a similar feature to the "shared timer" to deploy it as a private embedded app.

## Contacts
* Mark Orszycki (original dev in Python)
* Sean McNamara (ported to JS and enhanced)

## Solution Components
* Webex
* Javascript
* HTML/CSS
* Bun

## Prerequisites
#### Create a Webex Embedded App 
1. Navigate to https://developer.webex.com/ and login. 
2. Click on your icon > My Webex Apps (https://developer.webex.com/my-apps)
3. Create new App
4. Select "Meeting" & "Messaging". 
5. Give your app a name in the “Embedded app name” field. This will be the name you see when launching your app in Webex.
6. Fill in the “App Hub Description”
7. Upload an icon or select a default. This will be the icon you see when launching your app in Webex.
8. Enter your application’s PUBLIC_URL without the protocol in the “Valid Domains” field. I.E. using ngrok to test, enter the public domain that points to your endpoint ‘abc1–xyz3-410-c0c8-1806-00-1fj1.ngrok-free.app’
9. Enter your application’s PUBLIC_URL in the “Start Page URL” field. I.E. using ngrok to test, enter public url that points to your endpoint ’https://abc1–xyz3-410-c0c8-1806-00-1fj1.ngrok-free.app’.
10. Select your layout preference (side panel or main view)
11. Add Embedded App

## Installation/Configuration
1. Clone this repository with `git clone https://github.com/allquixotic/shared-timer`
2. Ensure Docker is installed if you want to build the Dockerfile.
3. [Install Bun](https://bun.sh) if you want to run locally.  
4. Run `./local_test.sh` to test it locally, or build the Dockerfile using standard Docker commands


## Usage
1. Run the program.
2. If the app is still in development: "Open and share my personal information" & click "Open."


## Embedded Application Flow
1. The process starts with a meeting participant clicking the Apps button (in a meeting) or tab (in a space) to view the list of available apps, and then opening your app.
2. An ‘initiator app’ will open. This is URL specified in your "Start Page URL" when you create a new embedded app in the Developer Portal. The “Start Page URL” lands at the Flask endpoint index.html page (PUBLIC_URL in .env). The purpose of the initiator app is to share the URL of an app — timer.html + timer.js + app.py in our case — that is either opened with meeting participants in real-time, or added as a tab to a space. You can customize the "Start Page URL" page by editing index.html, index.js, and styles.css file. This page must contain a button that calls the embedded apps framework’s setShareUrl() method and pass the URL of your application (‘PUBLIC_URL/timer’ in our case). If you attempt to skip this step, the Open for all or Add to tab button will not appear.
3. Click the ‘Launch’ button. This will call the setshareURL() method and the application will appear for you. 
4. Click Open for all (or Add to tab for spaces) to open for all participants.

### LICENSE

Provided under Cisco Sample Code License, for details see [LICENSE](LICENSE.md)

**PLEASE NOTE:** The CSCL is not a Free Software license. You must use this software in compliance with the terms, by only using it with a Cisco product (e.g. WebEx, as it is designed to be used with). I assume no legal liability if you misuse this code against the source code license.

#### DISCLAIMER:
<b>Please note:</b> This script is meant for demo purposes only. All tools/ scripts in this repo are released for use "AS IS" without any warranties of any kind, including, but not limited to their installation, use, or performance. Any use of these scripts and tools is at your own risk. There is no guarantee that they have been through thorough testing in a comparable environment and we are not responsible for any damage or data loss incurred with their use.
You are responsible for reviewing and testing any scripts you run thoroughly before use in any non-testing environment.