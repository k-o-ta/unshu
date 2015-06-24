'use strict';
require('dotenv').load();
var cheerio = require('cheerio-httpcli');
var url = require('url');
var twitter = require('twitter');
var WebSocketServer = require('ws').Server;
var qs = require('querystring');
var request = require('superagent');
var connpassApi = 'http://connpass.com/api/v1/event';

var twit = new twitter({
    consumer_key: process.env.CONSUMER_KEY,
    consumer_secret: process.env.CONSUMER_SECRET,
    access_token_key: process.env.ACCESS_TOKEN_KEY,
    access_token_secret: process.env.ACCESS_TOKEN_SECRET
});

// var inputUrl = process.argv[2];
// console.log('start monitoring: ' + inputUrl);
console.log('start monitoring!');

var fs = require('fs');
var app = require('http').createServer(function(req, res) {
  switch (req.url) {
  case '/':
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(fs.readFileSync('client/index.html'));
    break;
  case '/js/bundle.js':
    res.end(fs.readFileSync('client/js/bundle.js'));
    break;
  case '/css/addition.css':
    res.end(fs.readFileSync('client/css/addition.css'));
    break;
  case '/events':
  // console.log(req);
    var keyword = '';
    req.on('data', function(data){
      keyword += data;
    });
    req.on('end', function(){
      console.log(keyword);
      var queryKeyword = keyword.split(' ').join(',');
      request.get(connpassApi)
             .query('keyword=' + queryKeyword)
             .end(function(err, resApi){
               var eventHash = {};
               eventHash.events = {}
               resApi.res.body.events.forEach(function(e){
                 eventHash.events[e.title] = {url: e.event_url};
               });
              //  console.log(eventHash);
               broadcast(JSON.stringify(eventHash));
               res.end(JSON.stringify(eventHash));
             });
    });
    break;
  case '/event':
    var body = '';
    req.on('data', function(data){
      body += data;
    });
    req.on('end', function(){
      // console.log(body);
      showAllUsers(body, broadcast);
      res.end('finish');
    });
    break;
  }
}).listen(3000);

var connects = [];
// var userIds;
var userData;
var twitterScreenNamesSet;
function broadcast (message) {
    connects.forEach(function (socket, i) {
        socket.send(message);
    });
}

var wss = new WebSocketServer({'server': app});
wss.on('connection', function (ws) {
    console.log('WebSocketServer connected');
    connects.push(ws);
    broadcast(JSON.stringify(userData));
    ws.on('message', function (message) {
        console.log('received -' + message);
        broadcast(message);
    });

    ws.on('close', function () {
        console.log('stopping client send "close"');

        connects = connects.filter(function (conn, i) {
            return (conn === ws) ? false : true;
        });
    });
});

var showAllUsers = function (inputUrl, func){
  cheerio.fetch(inputUrl, function(err, $, res, html){
    var twitterScreenNames = [];
    $(".participation_table_area a").each(function(e){
      if ($('a')[e].attribs.title === 'Twitterを見る'){
        twitterScreenNames.push(url.parse($('a')[e].attribs.href, true).query.screen_name);
      }
    });

    twitterScreenNamesSet = twitterScreenNames.filter(function(screenName, index, self){
      return self.indexOf(screenName) === index;
    });
    twit.get('users/lookup', {screen_name: twitterScreenNamesSet.join(',')}, function(error, users, response){
      //  console.log(users);
      var userIds = [];
      userData = '';
      userData = users.reduce(function(previousUsers, currentUser){
        previousUsers[currentUser.id] = {name:                    currentUser.name,
                                         screen_name:             currentUser.screen_name,
                                         profile_image_url_https: currentUser.profile_image_url_https
                                       };
        if(typeof currentUser.status === 'undefined'){
          previousUsers[currentUser.id].text = '';
        }else{
          previousUsers[currentUser.id].text = currentUser.status.text;
        }
        userIds.push(currentUser.id);
        return previousUsers;
      }, {});
      // console.log(userData);
      if(typeof func !== 'undefined'){
        func(JSON.stringify(userData));
      }
      console.log(Object.keys(userData).length + 'users!');
      twit.stream('statuses/filter', {follow: userIds.join(',')}, function(stream) {
        stream.on('data', function (data) {
          // console.log(data);
          broadcast(JSON.stringify(data));
        });
      });
    });
  });
}
