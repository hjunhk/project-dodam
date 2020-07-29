var express = require('express');
var fs = require('fs');
// var serveStatic = require('serve-static');
// var path = require('path');

var app = express();
var port = 3000;

app.use('/public', express.static(__dirname + '/public'));
// app.use(express.static('/public/node_modules'));

app.listen(port, function() {
    console.log('Server Start, Port : ' + port);
});

app.get('/', function(req, res) {
    fs.readFile('main.html', function(error, data) {
        if(error) {
            console.log(error);
        } else {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(data);
        }
    });
});