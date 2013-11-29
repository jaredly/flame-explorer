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
    return function (key, res, log, cb) {
      var lkey = 'flame-hd-' + key + '-' + res + (log ? '-log' : '')
      if (window.localStorage[lkey]) {
        return cb(window.localStorage[lkey], 'cached', true)
      }
      var start = new Date().getTime()
      request.get('/high-def?funcs=' + key + '&res=' + res + (log ? '&log=true' : ''))
        .end(function (req) {
          try {
            window.localStorage[lkey] = req.text
          } catch (e) {}
          cb(req.text, (new Date().getTime() - start) / 1000)
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

    $scope.refreshHD = function () {
      highDef(makeKey($scope.MainFormulas), $scope.hdRes, $scope.hdLog, function (data, time, cached) {
        $scope.HighDef = data
	$scope.hdLoadtime = time
	$scope.loadingHD = false
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
      $scope.loadingHD = true
      $scope.refreshHD()
    }

    $scope.zoomIn = function ($event) {
      var pos = localPos($event)
      console.log('you clicked', pos)
    }
    $scope.zoomOut = function ($event) {
      var pos = localPos($event)
      console.log('you zoom out', pos)
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
