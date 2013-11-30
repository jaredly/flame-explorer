var x = require('xon')
  , request = require('superagent')
  , position = require('position')

function localPos(evt) {
  var pos = position(evt.target)
  return {
    top: evt.pageY - pos.top,
    left: evt.pageX - pos.left
  }
}

function makeKey(funcs) {
  return funcs.map(function (f) {return f.Num + ''}).join(':')
}

angular.module('MyApp', [])
  .factory('highDef', function () {
    return function (key, res, log, pos, cb) {
      var lkey = 'flame-hd-' + key + '-' + res + (log ? '-log' : '')
      if (pos.x != 0 || pos.y != 0 || pos.xscale != 1 || pos.yscale == 1) {
	lkey = null
      }
      if (lkey && window.localStorage[lkey]) {
        return cb(window.localStorage[lkey], 'cached', true)
      }
      var start = new Date().getTime()
      var postext = '&x=' + pos.x + '&y=' + pos.y + '&xscale=' + pos.xscale + '&yscale=' + pos.yscale
      request.get('/high-def?funcs=' + key + '&res=' + res + (log ? '&log=true' : '') + postext)
        .end(function (req) {
	  if (lkey) {
	    try {
	      window.localStorage[lkey] = req.text
	    } catch (e) {}
	  }
          cb(req.text, (new Date().getTime() - start) / 1000 + 's')
        })
    }
  })
  .factory('getData', function () {
    return function (key, cb) {
      if (window.localStorage['flame-' + key]) {
        try {
          return cb(JSON.parse(window.localStorage['flame-' + key]), true)
        } catch (e) {}
      }
      request.get('/render?funcs=' + key)
        .end(function (req) {
          try {
            window.localStorage['flame-' + key] = JSON.stringify(req.body)
          } catch (e) {}
          cb(req.body)
        })
    }
  })
  .directive('ngRightClick', function($parse) {
    return function(scope, element, attrs) {
        var fn = $parse(attrs.ngRightClick);
        element.bind('contextmenu', function(event) {
            scope.$apply(function() {
                event.preventDefault();
                fn(scope, {$event:event});
            });
        });
    };
  })


  .controller('MainController', ['$scope', 'getData', 'highDef', function ($scope, getData, highDef) {
    
    window.addEventListener("hashchange", function () {
      $scope.loading = true
      getData(window.location.hash.slice(1), function (data, cache) {
        gotData(data, cache)
      })
      $scope.$digest()
    })

    function gotData(data, cached) {
      $scope.loading = false
      for (var name in data) {
        if (!name.match(/^[a-zA-Z0-9_-]+$/)) continue;
        $scope[name] = data[name]
      }
      if (!cached) $scope.$digest()
    }
    // getData([], gotData)
    if (!window.location.hash || window.location.hash == '#') {
      window.location.hash = '5:7'
    } else {
      getData(window.location.hash.slice(1), gotData)
    }
    
    $scope.logEqualize = false;
    $scope.$watch('logEqualize', function (value, old) {
      if ('undefined' === typeof old) return
      var hash = window.location.hash.slice(1)
        , parts = hash.split('&')
        , current = parts.length === 2
      if (value === current) return
      if (value) {
        hash += '&log'
      } else {
        hash = parts[0]
      }
      window.location.hash = hash
    })

    $scope.useChild = function (fractal) {
      window.location.hash = makeKey(fractal.Formulas)
    }

    $scope.makeKey = function () {
      return $scope.MainFormulas ? makeKey($scope.MainFormulas) : ''
    }

    $scope.loadingHD = false
    $scope.hdRes = 100*1000
    $scope.hdLog = false
    $scope.pos = {
      x: 0,
      y: 0,
      xscale: 1,
      yscale: 1
    }
    var loadingTimes = {
      100000: 200,
      1000000: 800,
      10000000: 3.5 * 1000
    }

    $scope.refreshHD = function () {
      $scope.loadingHD = true
      var start = new Date().getTime()
      var p = document.getElementById('hd-progress')
      var tid = setInterval(function () {
	p.style.width = (new Date().getTime() - start)*100/loadingTimes[$scope.hdRes] + '%';
      }, 50)
      highDef(makeKey($scope.MainFormulas), $scope.hdRes, $scope.hdLog, $scope.pos, function (data, time, cached) {
	clearTimeout(tid)
        $scope.HighDef = data
	$scope.hdLoadtime = time
	loadingTimes[$scope.hdRes] = new Date().getTime() - start
	$scope.loadingHD = false
	p.style.width = '0%'
        if (!cached) $scope.$digest()
      })
    }

    $scope.toggleHdLog = function () {
      $scope.hdLog = !$scope.hdLog
      $scope.refreshHD()
    }

    $scope.hdResolutions = [
      // {num: 1000*10, text: '10k'},
      {num: 1000*100, text: '100k'},
      {num: 1000*1000, text: '1m'},
      {num: 1000*1000*10, text: '10m'}
    ]

    $scope.setHDRes = function (num) {
      $scope.hdRes = num;
      $scope.refreshHD();
    }

    $scope.showHD = function () {
      if (!$scope.MainFormulas.length) return
      $scope.showingHD = true
      $scope.hdRes = 1000 * 100
      $scope.resetZoom()
    }

    $scope.resetZoom = function () {
      $scope.pos = {
	x: 0,
	y: 0,
	xscale: 1,
	yscale: 1
      }
      $scope.refreshHD()
    }

    $scope.zoomIn = function ($event) {
      var pos = localPos($event)
      console.log('you clicked', pos)
      var x = pos.left/800-.5
        , y = -pos.top/800+.5
      console.log('rel', x, y)

      $scope.pos.x += x/$scope.pos.xscale
      $scope.pos.y += y/$scope.pos.yscale
      $scope.pos.xscale *= 1.5
      $scope.pos.yscale *= 1.5
      $scope.refreshHD();
    }
    $scope.zoomOut = function ($event) {
      var pos = localPos($event)
      console.log('you zoom out', pos)
      $scope.pos.xscale /= 1.5
      $scope.pos.yscale /= 1.5
      $scope.pos.x /= 1.5
      $scope.pos.y /= 1.5
      $scope.refreshHD();
    }

    $scope.hideHD = function () {
      $scope.showingHD = false
      $scope.HighDef = false
      $scope.loadingHD = false
    }
  }])

module.exports = function (document) {
  var el = document.getElementById('main')
  angular.bootstrap(el, ['MyApp'])
}
