package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"github.com/codegangsta/cli"
	"github.com/codegangsta/martini"
	"github.com/jaredly/goflam3"
	"image"
	"image/png"
	"net/http"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func imageToBase64(image *image.RGBA) string {
	var b bytes.Buffer
	png.Encode(&b, image)
	return fmt.Sprintf("data:image/png;base64,%s", base64.StdEncoding.EncodeToString(b.Bytes()))
}

// WebRender is the datatype holding each child image
type WebRender struct {
	Image    string
	Time     time.Duration
	Formulas []flame.FunConfig
	Disabled bool
	Text     string
	Num int
}

type WebFunc struct {
	Num  int
	Text string
}

// InitialResponse is the json object returned by the /render route.
type InitialResponse struct {
	MainImage    string
	Formulas     []WebFunc
	ChildImages  []WebRender
	MainFormulas []flame.FunConfig
}

// GetWebFuncs translates the variations into a web-digestable format
func GetWebFuncs() []WebFunc {
	exp := flame.AllVariations()
	res := make([]WebFunc, len(exp))
	for i := range res {
		res[i] = WebFunc{
			Num:  i,
			Text: exp[i].Text,
		}
	}
	return res
}

func howTrue(bools []bool) int {
	num := 0
	for _, t := range bools {
		if t {
			num += 1
		}
	}
	return num
}

func usingToFuns(using []bool) []flame.FunConfig {
	num := howTrue(using)
	res := make([]flame.FunConfig, num)
	z := 0
	for i, t := range using {
		if t {
			res[z] = flame.FunConfig{i}
			z += 1
		}
	}
	return res
}

func blankImage(width, height int) *image.RGBA {
	return image.NewRGBA(image.Rect(0, 0, width, height))
}

// RenderChildren renders all flames that would be produced by
// enabling/disabling each function variation in turn
func RenderChildren(width, height, iterations int, funs []flame.FunConfig) []WebRender {
	texts := flame.AllVariations()
	variations := len(texts)
	res := make([]WebRender, variations)
	using := make([]bool, variations)
	for _, f := range funs {
		using[f.Num] = true
	}
	for i := range res {
		using[i] = !using[i]
		funs := usingToFuns(using)
		var im *image.RGBA
		start := time.Now()
		if len(funs) == 0 {
			im = blankImage(width, height)
		} else {
			im, _ = flame.Flame(flame.Config{
				Dims: flame.Dims{
					Width:  width,
					Height: height,
					Xscale: 1,
					Yscale: 1,
				},
				Iterations: iterations,
				Functions:  funs,
			})
		}
		res[i] = WebRender{
			Image:    imageToBase64(im),
			Disabled: using[i],
			Time:     time.Since(start),
			Formulas: funs,
			Text:     texts[i].Text,
			Num: i,
		}
		using[i] = !using[i]
	}
	return res
}

func getFunsFromParam(param string) []flame.FunConfig {
	nums := strings.Split(param, ":")
	ret := make([]flame.FunConfig, len(nums))
	for i, x := range nums {
		n, err := strconv.Atoi(x)
		if err != nil {
			return nil
		}
		ret[i] = flame.FunConfig{n}
	}
	return ret
}

type Cachier map[int]*image.RGBA

func getFloat(lst []string, def float64) float64 {
	if 1 == len(lst) {
		if p, err := strconv.ParseFloat(lst[0], 64); err == nil {
			return p
		}
	}
	return def
}

func getNum(lst []string, def int) int {
	num := def
	var err error
	if 1 == len(lst) {
		num, err = strconv.Atoi(lst[0])
		if err != nil {
			num = def
		}
	}
	return num
}

func getBool(lst []string, def bool) bool {
	if 1 == len(lst) {
		if lst[0] == "false" {
			def = false
		} else {
			def = true
		}
	}
	return def
}

func base64Request(req *http.Request) bool {
	return 1 == len(req.Header["accept-encoding"]) && req.Header["accept-encoding"][0] == "base64"
}

func cliWebserver(c *cli.Context) {
	m := martini.Classic()
	cachier := &Cachier{}
	m.Map(cachier)

	m.Get("/functions", func(resrw http.ResponseWriter, req *http.Request) string {
		resrw.Header().Set("Content-Type", "application/json")
		fns := flame.AllVariations()
		response := make([]map[string]interface{}, len(fns))
		for i, fn := range fns {
				response[i] = map[string]interface{}{
						"Text": fn.Text,
						"Num": i,
						"Enabled": false,
				}
		}
		res, _ := json.Marshal(response)
		return string(res)
	})

	m.Get("/render", func(resrw http.ResponseWriter, req *http.Request) string {
		var funs []flame.FunConfig
		resrw.Header().Set("Content-Type", "application/json")
		req.ParseForm()
		if 1 == len(req.Form["funcs"]) {
			funs = getFunsFromParam(req.Form["funcs"][0])
		}
		var im *image.RGBA
		if funs == nil || len(funs) == 0 {
			im = blankImage(300, 300)
		} else {
			im, _ = flame.Flame(flame.Config{
				Dims: flame.Dims{
					Width:  300,
					Height: 300,
					Xscale: 1,
					Yscale: 1,
				},
				Iterations:  1000 * 1000,
				Functions:   funs,
				LogEqualize: getBool(req.Form["log"], false),
			})
		}
		response := InitialResponse{
			MainImage:    imageToBase64(im),
			MainFormulas: funs,
			Formulas:     GetWebFuncs(),
			ChildImages:  RenderChildren(150, 150, 100*1000, funs),
		}
		defer runtime.GC()
		res, _ := json.Marshal(response)
		return string(res)
	})

  m.Get("/preview", func(resrw http.ResponseWriter, req *http.Request, c *Cachier) {
    vars := flame.AllVariations()
		req.ParseForm()
    num := getNum(req.Form["func"], 0)
    if num >= len(vars) {
      num = 0
    }
		im, ok := (*c)[num]
		if !ok {
				im = flame.RenderPreview(200, 200, 20, 20, vars[num].Fn)
				(*c)[num] = im
		}
		resrw.Header().Set("Content-Type", "image/png")
		resrw.Header().Set("Cache-Control", "public, max-age=2000")
    if (base64Request(req)) {
      resrw.Header().Set("Content-Encoding", "base64")
      bytes.NewBufferString(imageToBase64(im)).WriteTo(resrw)
    } else {
      var b bytes.Buffer
      png.Encode(&b, im)
      b.WriteTo(resrw)
    }
		defer runtime.GC()
  })

	m.Get("/preview-all", func(resrw http.ResponseWriter, req *http.Request) {
		im := flame.PreviewAll(200, 200, 20, 20, 4)
		resrw.Header().Set("Content-Type", "image/png")
		resrw.Header().Set("Cache-Control", "public, max-age=1000000")
    if (base64Request(req)) {
      resrw.Header().Set("Content-Encoding", "base64")
      bytes.NewBufferString(imageToBase64(im)).WriteTo(resrw)
    } else {
      var b bytes.Buffer
      png.Encode(&b, im)
      b.WriteTo(resrw)
    }
		defer runtime.GC()
	})

	m.Get("/render-one", func(resrw http.ResponseWriter, req *http.Request) {
		var funs []flame.FunConfig
		req.ParseForm()
		if 1 == len(req.Form["funcs"]) {
			funs = getFunsFromParam(req.Form["funcs"][0])
		}
		width := getNum(req.Form["width"], 800)
		if width > 800 {
		  width = 800
		}
		if height > 800 {
		  height = 800
		}
		height := getNum(req.Form["height"], 800)
		var im *image.RGBA
		if funs == nil || len(funs) == 0 {
			im = blankImage(width, height)
		} else {
			im, _ = flame.Flame(flame.Config{
				Dims: flame.Dims{
					Width:  width,
					Height: height,
					X:      getFloat(req.Form["x"], 0),
					Xscale: getFloat(req.Form["xscale"], 1),
					Y:      getFloat(req.Form["y"], 0),
					Yscale: getFloat(req.Form["yscale"], 1),
				},
				Iterations:  getNum(req.Form["res"], 1000*100),
				Functions:   funs,
				LogEqualize: getBool(req.Form["log"], false),
			})
		}
		defer runtime.GC()
		resrw.Header().Set("Content-Type", "image/png")
		resrw.Header().Set("Cache-Control", "public, max-age=300")
		if base64Request(req) {
			resrw.Header().Set("Content-Encoding", "base64")
			bytes.NewBufferString(imageToBase64(im)).WriteTo(resrw)
		} else {
			var b bytes.Buffer
			png.Encode(&b, im)
			b.WriteTo(resrw)
		}
	})

	m.Get("/high-def", func(req *http.Request) string {
		var funs []flame.FunConfig
		req.ParseForm()
		if 1 == len(req.Form["funcs"]) {
			funs = getFunsFromParam(req.Form["funcs"][0])
		}
		width := getNum(req.Form["width"], 800)
		height := getNum(req.Form["height"], 800)
		var im *image.RGBA
		if funs == nil || len(funs) == 0 {
			im = blankImage(width, height)
		} else {
			im, _ = flame.Flame(flame.Config{
				Dims: flame.Dims{
					Width:  width,
					Height: height,
					X:      getFloat(req.Form["x"], 0),
					Xscale: getFloat(req.Form["xscale"], 1),
					Y:      getFloat(req.Form["y"], 0),
					Yscale: getFloat(req.Form["yscale"], 1),
				},
				Iterations:  getNum(req.Form["res"], 1000*1000*10),
				Functions:   funs,
				LogEqualize: getBool(req.Form["log"], false),
			})
		}
		defer runtime.GC()
		return imageToBase64(im)
	})

	m.Run()
}
