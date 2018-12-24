import {xhrI, xhrResponseI, sendMessageI, responseMessageI} from "./api/messageInterface";
import {scheduleUpdate} from "./utils/scheduler";
import {checkInit, checkContinue} from "./updateCheck/backgroundIframe";

api.request.sendMessage = function(message: sendMessageI){
  return new Promise((resolve, reject) => {
    messageHandler(message, null, function(response: responseMessageI) {
      resolve(response);
    });
  });
}

chrome.runtime.onInstalled.addListener(function(details){
    if(details.reason == "install"){
    }else if(details.reason == "update"){
    }
    chrome.alarms.clearAll();
});

chrome.runtime.onMessage.addListener((message: sendMessageI, sender, sendResponse)  => {
  return messageHandler(message, sender, sendResponse)
});

function messageHandler(message: sendMessageI, sender, sendResponse){
  switch (message.name) {
    case "xhr": {
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function(){
        if (xhr.readyState == 4) {
          console.log(xhr);
          var responseObj: xhrResponseI = {
            finalUrl: xhr.responseURL,
            responseText: xhr.responseText,
            status: xhr.status
          }
          sendResponse(responseObj);
        }
      }

      if(typeof message.url === 'object'){
        xhr.open(message.method, message.url.url, true);
        for (var key in message.url.headers) {
          xhr.setRequestHeader(key, message.url.headers[key]);
        }
        getCookies(message.url.url, sender, xhr, () => {
          //@ts-ignore
          xhr.send(message.url.data);
        });
      }else{
        xhr.open(message.method, message.url, true);
        getCookies(message.url, sender, xhr, function(){
          xhr.send();
        });

      }
      return true;
    }
    case "iframeDone": {
      checkContinue(message);
    }
  }
  return undefined;
}

function getCookies(url, sender, xhr, callback = function(){}){
  if(typeof sender != 'undefined' && sender && typeof sender.tab != 'undefined' && typeof sender.tab.cookieStoreId != 'undefined'){
    //@ts-ignore
    if(browser) {
      //@ts-ignore
      browser.cookies.getAll({storeId: sender.tab.cookieStoreId, url: url}).then(function(cookies){
        con.log('Cookie Store', sender.tab.cookieStoreId, cookies);
        var cookiesText = '';
        for (var key in cookies) {
          var cookie = cookies[key];
          cookiesText += cookie.name+'='+cookie.value+'; ';
        }
        if(cookiesText !== ''){
          xhr.setRequestHeader('CookieTemp', cookiesText);
          xhr.withCredentials = "true";
        }

        callback();
      });
      return;
    }
  }
  callback();
}

chrome.alarms.get("schedule", function(a) {
  if(typeof a === 'undefined'){
    con.log('Create schedule Alarm');
    chrome.alarms.create("schedule", {
      periodInMinutes: 60 * 24
    });
    scheduleUpdate();
  }else{
    con.log(a);
  }
});

chrome.alarms.get("updateCheck", async function(a) {
  if(typeof a === 'undefined'){
    var updateCheckTime = await api.storage.get("updateCheckTime");
    if(typeof updateCheckTime != 'undefined' && updateCheckTime && updateCheckTime != '0'){
      var updateCheck = await api.storage.get("updateCheck");
      if(typeof updateCheck === 'undefined' || !parseInt(updateCheck) || parseInt(updateCheck) < Date.now()){
        updateCheck = Date.now() + 1000;
      }
      con.log('Create updateCheck Alarm', updateCheckTime+'m', updateCheck);
      chrome.alarms.create("updateCheck", {
        periodInMinutes: parseInt(updateCheckTime),
        when: parseInt(updateCheck)
      });
    }
  }else{
    con.log(a);
  }
});

chrome.alarms.onAlarm.addListener(function(alarm) {
  if(typeof alarm.periodInMinutes != 'undefined'){
    api.storage.set( alarm.name, Date.now() + ( alarm.periodInMinutes * 1000 * 60) );
  }
  if (alarm.name === "schedule") {
    scheduleUpdate();
  }
});

checkInit();

function webRequestListener(){
  chrome.permissions.contains({
    permissions: ['webRequest']
  }, function(result) {
    if (result) {
      con.log('webRequest permissions found');
      chrome.webRequest.onHeadersReceived.addListener(function (details) {
        con.log('test', details);
        if(details.initiator!.indexOf(chrome.runtime.id) !== -1){
          con.log('Remove x-frame-options');
          for (var i = 0; i < details.responseHeaders!.length; ++i) {
            if (details.responseHeaders![i].name.toLowerCase() == 'x-frame-options') {
              details.responseHeaders!.splice(i, 1);
              return {
                responseHeaders: details.responseHeaders
              };
            }
          }
        }
      }, {
        urls: ["*://*/*mal-sync-background=*"]
      }, ["blocking", "responseHeaders"]);
    }
  });

  chrome.permissions.contains({
    permissions: ['webRequest', 'cookies']
  }, function(result) {
    if (result) {
      chrome.webRequest.onBeforeSendHeaders.addListener(
          function (details) {
            var tempCookies = '';
            details.requestHeaders!.forEach(function(requestHeader){
              if (requestHeader.name === "CookieTemp") {
                tempCookies = requestHeader!.value!;
              }
            });

            if(tempCookies !== ''){
              con.log('Replace Cookies', tempCookies);
              details.requestHeaders!.forEach(function(requestHeader){
                if (requestHeader.name.toLowerCase() === "cookie") {
                  requestHeader.value = tempCookies;
                }
              });
            }
            return {
              requestHeaders: details.requestHeaders
            };

          }, {
              urls: [ "*://myanimelist.net/*" ]
          }, ['blocking', 'requestHeaders']
      );

    } else {
      con.log('No webRequest permissions');
    }
  });
}

webRequestListener();
chrome.permissions.onAdded.addListener(function(){
  webRequestListener();
});

chrome.notifications.onClicked.addListener(function(notificationId) {
  chrome.tabs.create({url: notificationId});
});

/*chrome.permissions.request({
    permissions: ["webRequest", "webRequestBlocking"],
    origins: chrome.runtime.getManifest().optional_permissions!.filter((permission) => {return (permission != 'webRequest' && permission != 'webRequestBlocking')})
  }, function(granted) {
    con.log('optional_permissions', granted);
  });*/
