var express = require('express');
var fs = require('fs');

var app = express();
var port = 8080;

app.use('/public', express.static(__dirname + '/public'));

app.listen(port, function() {
    console.log('Server Start, Port : ' + port);
});

app.get('/', function(req, res) {
    fs.readFile('main.html', function(error, data) {
        if (error) {
            console.log(error);
        } else {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(data);
        }
    });
});