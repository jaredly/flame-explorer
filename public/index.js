var x = require('xon')
, request = require('superagent')
, position = require('position')
, _ = require('lodash')

function localPos(evt) {
  var pos = position(evt.target)
  return {
    top: evt.pageY - pos.top,
    left: evt.pageX - pos.left
  }
}

function makeKey(funcs) {
  return funcs.filter(function (f) {return f.Enabled}).map(function (f) {return f.Num + ''}).join(':')
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
  return function (cb) {
    request.get('/functions').end(function (req) {
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

.directive('ngLoaded', function ($parse) {
  return function (scope, element, attrs) {
    var fn = $parse(attrs.ngLoaded)
    element.bind('load', function (event) {
      scope.$apply(function() {
      fn(scope)
      });
    })
    /*
    attrs.$observe('ngSrc', function () {
      setTimeout(function () {
        if (element[0].loaded
      }, 10)
    })
    */
  }
})

.controller('MainController', ['$scope', 'getData', 'highDef', function ($scope, getData, highDef) {
  getData(function (data) {
    $scope.functions = data
    refun()
    $scope.$digest()
  })

  function unload(){
    for (var i=0; i<$scope.functions.length; i++) {
      $scope.functions[i].Loaded = false
    }
    $scope.mainIsLoaded = false
    $scope.loading = true
  }

  function refun(){
    var parts = window.location.hash.slice(1).split(':').map(function(x){return parseInt(x,10)})
    console.log(parts)
    for (var i=0; i<$scope.functions.length; i++) {
      $scope.functions[i].Enabled = parts.indexOf(i) !== -1
    }
    unload()
  }

  function allLoaded() {
    var num = $scope.functions.filter(function (f) {return !f.Loaded})
    return num.length === 0
  }

  $scope.mainLoaded = function () {
    $scope.mainIsLoaded = true
    if (allLoaded()) {
      $scope.loading = false
    }
  }

  $scope.childLoaded = function (num) {
    $scope.functions[num].Loaded = true
    if ($scope.mainIsLoaded && allLoaded()) {
      $scope.loading = false
    }
  }

  window.addEventListener("hashchange", function () {
    refun()
    $scope.$digest()
  })

  if (!window.location.hash || window.location.hash == '#') {
    window.location.hash = '5:7'
  }

  $scope.logEqualize = false;
  /*
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
  */

  $scope.useChild = function (fractal) {
    window.location.hash = makeKey(fractal.functions)
  }

  $scope.makeChild = function (func) {
    var fns = _.cloneDeep($scope.functions)
    fns[func].Enabled = !fns[func].Enabled
    return makeKey(fns)
  }

  $scope.toggle = function (func) {
    func.Enabled = !func.Enabled
    window.location.hash = makeKey($scope.functions)
  }

  $scope.makeKey = function () {
    return $scope.functions ? makeKey($scope.functions) : ''
  }

  $scope.setRes = function (res) {
    $scope.res = res
    unload()
  }

  $scope.res = 1000*100;
  $scope.resolutions = [
    {num: 1000*1, text: '1k'},
    {num: 1000*10, text: '10k'},
    {num: 1000*100, text: '100k'},
    {num: 1000*1000, text: '1m'},
  ]

  $scope.hdResolutions = [
    // {num: 1000*10, text: '10k'},
    {num: 1000*100, text: '100k'},
    {num: 1000*1000, text: '1m'},
    {num: 1000*1000*10, text: '10m'},
    {num: 1000*1000*100, text: '100m'}
  ]
  $scope.loadingHD = false
  $scope.hdRes = 1000*1000
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
    10000000: 3.5 * 1000,
    100000000: 30 * 1000
  }

  var hdLoad = {
    tid: null,
    start: null
  }

  $scope.refreshHD = function () {
    $scope.loadingHD = true
    hdLoad.start = new Date().getTime()
    var p = document.getElementById('hd-progress')
    hdLoad.tid = setInterval(function () {
      p.style.width = (new Date().getTime() - hdLoad.start)*100/loadingTimes[$scope.hdRes] + '%';
    }, 50)
  }

  $scope.hdLoaded = function () {
    $scope.loadingHD = false
    if (!hdLoad.start) return
    var p = document.getElementById('hd-progress')
    p.style.width = '0%'
    var time = new Date().getTime() - hdLoad.start
    if (time > 100) {
      loadingTimes[$scope.hdRes] = time
    }
    $scope.hdLoadtime = time/1000 + 's'
    clearTimeout(hdLoad.tid)
    hdLoad.start = null
  }

  $scope.toggleHdLog = function () {
    $scope.hdLog = !$scope.hdLog
    $scope.refreshHD()
  }

  $scope.setHDRes = function (num) {
    $scope.hdRes = num;
    $scope.refreshHD();
  }

  $scope.showHD = function () {
    if (!$scope.functions.length || !makeKey($scope.functions).length) return
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
    $scope.hdRes = 1000*1000
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
