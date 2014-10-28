/* 
 * Copyright (c) 2012 Kaerus (kaerus.com), Anders Elo <anders @ kaerus com>.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
(function outer(modules, cache, entries) {
    var global = function() {
        return this;
    }();
    function require(name, jumped) {
        if (cache[name]) return cache[name].exports;
        if (modules[name]) return call(name, require);
        throw new Error('cannot find module "' + name + '"');
    }
    function call(id, require) {
        var m = cache[id] = {
            exports: {}
        };
        var mod = modules[id];
        var name = mod[2];
        var fn = mod[0];
        fn.call(m.exports, function(req) {
            var dep = modules[id][1][req];
            return require(dep ? dep : req);
        }, m, m.exports, outer, modules, cache, entries);
        if (name) cache[name] = cache[id];
        return cache[id].exports;
    }
    for (var id in entries) {
        if (entries[id]) {
            global[entries[id]] = require(id);
        } else {
            require(id);
        }
    }
    require.duo = true;
    require.cache = cache;
    require.modules = modules;
    return require;
})({
    1: [ function(require, module, exports) {
        var Arango = require("./lib/arango");
        Arango.lazy = false;
        module.exports = Arango;
    }, {
        "./lib/arango": 2
    } ],
    2: [ function(require, module, exports) {
        "use strict";
        var uPromise, base64 = require("base64"), utils = require("./utils"), Xhr = require("./xhr"), url = require("./url");
        try {
            uPromise = require("micropromise");
        } catch (e) {
            uPromise = require("uP");
        }
        var API_DIR = "./api/", API_MODULES = [ "transaction", "collection", "database", "document", "cursor", "job", "simple", "index", "query", "admin", "aqlfunction", "endpoint", "import", "traversal", "graph", "batch", "edge", "action", "user" ], ArangoAPI;
        function Arango(db, options) {
            if (!(this instanceof Arango)) {
                return new Arango(db, options);
            }
            attach(this, ArangoAPI);
            if (db instanceof Arango) {
                this._name = db._name;
                this._collection = db._collection;
                this._server = utils.extend(true, {}, db._server);
            } else options = db;
            if (options) {
                if (typeof options === "string") {
                    utils.extend(true, this, url.path2db(options));
                } else if (typeof options === "object") {
                    if (options.api) attach(this, options.api);
                    if (options._name) this._name = options._name;
                    if (options._server) this._server = options._server;
                    if (options._collection) this._collection = options._collection;
                }
            }
            if (typeof this._server !== "object") this._server = {};
            if (typeof this._server.protocol !== "string") this._server.protocol = "http";
            if (typeof this._server.hostname !== "string") this._server.hostname = "127.0.0.1";
            if (typeof this._server.port !== "number") this._server.port = parseInt(this._server.port || 8529, 10);
            if (typeof this._collection !== "string") this._collection = "";
            if (this._server.username) {
                if (typeof this._server.headers !== "object") this._server.headers = {};
                this._server.headers["authorization"] = "Basic " + base64.encode(this._server.username + ":" + this._server.password);
            }
        }
        Arango.Connection = function() {
            var options = {};
            for (var i = 0; arguments[i]; i++) {
                if (typeof arguments[i] === "object") utils.extend(true, options, arguments[i]); else if (typeof arguments[i] === "string") utils.extend(true, options, url.path2db(arguments[i]));
            }
            return new Arango(options);
        };
        Arango.api = function(ns, exp) {
            var api = {};
            api[ns] = exp;
            attach(this, api);
            return exp;
        };
        Arango.base64 = base64;
        Arango.lazy = true;
        Arango.prototype = {
            use: function(options) {
                return new Arango(this, options);
            },
            useCollection: function(collection) {
                return this.use(":" + collection);
            },
            useDatabase: function(database) {
                return this.use("/" + database);
            },
            api: function(api) {
                if (!api) return ArangoAPI;
                attach(this, api);
                return new Arango(this);
            },
            request: function(method, path, data, headers, callback) {
                var promise, options;
                if ([ "GET", "HEAD", "DELETE", "OPTIONS" ].indexOf(method) >= 0) {
                    callback = headers;
                    headers = data;
                    data = undefined;
                }
                if (typeof callback !== "function") promise = new uPromise();
                if (data && typeof data !== "string") {
                    try {
                        data = JSON.stringify(data);
                    } catch (err) {
                        return promise ? promise.reject(err) : callback(err);
                    }
                }
                options = utils.extend(true, {}, this._server, {
                    headers: headers
                });
                if (this._name) {
                    path = "/_db/" + this._name + path;
                }
                Xhr(method, path, options, data, promise || callback);
                return promise;
            },
            setAsyncMode: function(active, fireAndForget) {
                if (!active) {
                    if (this._server.headers !== undefined) delete this._server.headers["x-arango-async"];
                    return this;
                }
                if (typeof this._server.headers !== "object") this._server.headers = {};
                this._server.headers["x-arango-async"] = fireAndForget ? "true" : "store";
                return this;
            },
            Promise: uPromise
        };
        [ "get", "put", "post", "patch", "delete", "head", "options" ].forEach(function(method) {
            Arango.prototype[method] = function(path, data, headers) {
                var urlopt, callback = this.__callback;
                if (this.__headers) {
                    headers = utils.extend(true, {}, headers, this.__headers);
                }
                if (this.__options) {
                    urlopt = url.options(this.__options);
                    if (path.indexOf("?") > 0) path += "&" + urlopt.substr(1); else path += urlopt;
                }
                return this.request(method.toUpperCase(), path, data, headers, callback);
            };
        });
        function attach(db, api) {
            if (typeof api === "string") {
                api = fetch(api);
            }
            for (var ns in api) {
                if (!Object.getOwnPropertyDescriptor(db, ns)) load(db, ns, api[ns], Arango.lazy);
            }
        }
        function load(db, ns, api, lazy) {
            if (lazy) {
                Object.defineProperty(db, ns, {
                    enumerable: true,
                    configurable: true,
                    get: function() {
                        return context();
                    }
                });
            } else {
                db[ns] = typeof api === "function" ? api(db) : context();
            }
            function context() {
                var instance = require(api)(db);
                proxyMethods(db, instance);
                context = function() {
                    return instance;
                };
                return instance;
            }
        }
        function proxyMethods(db, instance) {
            Object.keys(instance).forEach(function(method) {
                var api_method = instance[method];
                if (typeof api_method === "function") {
                    instance[method] = function() {
                        var args = [].slice.call(arguments), arg, i;
                        if (i = args.length) {
                            arg = args[i - 1];
                            if (arg && typeof arg === "function") {
                                db.__callback = arg;
                                args.splice(i - 1, 1);
                                arg = args[i - 2];
                            }
                            if (arg && typeof arg === "object") {
                                if (arg.hasOwnProperty("__headers")) {
                                    db.__headers = arg.__headers;
                                    delete arg.__headers;
                                }
                                if (arg.hasOwnProperty("__options")) {
                                    db.__options = arg.__options;
                                    delete arg.__options;
                                }
                            }
                        }
                        try {
                            return api_method.apply(instance, args);
                        } catch (e) {
                            throw e;
                        } finally {
                            db.__callback = undefined;
                            db.__headers = undefined;
                            db.__options = undefined;
                        }
                        throw new Error("unexpected return");
                    };
                } else if (typeof api_method === "object") {
                    proxyMethods(db, api_method);
                }
            });
        }
        function fetch(api) {
            var o = {};
            if (typeof api === "string") api = api.split(" ");
            for (var n in api) o[api[n]] = API_DIR + api[n];
            return o;
        }
        ArangoAPI = fetch(API_MODULES);
        module.exports = Arango;
    }, {
        base64: 3,
        "./utils": 4,
        "./xhr": 5,
        "./url": 6,
        uP: 7
    } ],
    3: [ function(require, module, exports) {
        var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var url = {
            "+": "-",
            "/": "_",
            "=": ""
        };
        var Base64 = {
            encode: function(buf) {
                var ret = [], x = 0, z, b1, b2;
                var len = buf.length;
                var code = buf.charCodeAt ? buf.charCodeAt.bind(buf) : function(i) {
                    return buf[i];
                };
                for (var i = 0; i < len; i += 3) {
                    z = code(i) << 16 | (b1 = code(i + 1)) << 8 | (b2 = code(i + 2));
                    ret[x++] = b64[z >> 18];
                    ret[x++] = b64[z >> 12 & 63];
                    ret[x++] = b64[z >> 6 & 63];
                    ret[x++] = b64[z & 63];
                }
                if (isNaN(b1)) {
                    ret[x - 2] = b64[64];
                    ret[x - 1] = b64[64];
                } else if (isNaN(b2)) {
                    ret[x - 1] = b64[64];
                }
                return ret.join("");
            },
            decode: function(buf) {
                var ret = [], z, x, i, b1, b2, w = [];
                var len = buf.length;
                var code = buf.indexOf.bind(b64);
                for (i = 0; i < len; i++) {
                    if (i % 4) {
                        b1 = code(buf[i - 1]);
                        b2 = code(buf[i]);
                        z = (b1 << i % 4 * 2) + (b2 >> 6 - i % 4 * 2);
                        w[i >>> 2] |= z << 24 - i % 4 * 8;
                    }
                }
                for (i = 0, x = 0, l = w.length; i < l; i++) {
                    ret[x++] = String.fromCharCode(w[i] >> 16);
                    ret[x++] = String.fromCharCode(w[i] >> 8 & 255);
                    ret[x++] = String.fromCharCode(w[i] & 255);
                }
                if (b1 === 64) {
                    ret.splice(-2, 2);
                } else if (b2 === 64) {
                    ret.pop();
                }
                return ret.join("");
            },
            encodeURL: function(buf) {
                var encoded = this.encode(buf);
                for (var enc in url) encoded = encoded.split(enc).join(url[enc]);
                return encoded;
            },
            decodeURL: function(buf) {
                var data, pad;
                for (var enc in url) {
                    if (url[enc]) data = buf.split(url[enc]).join(enc);
                }
                if (pad = data.length % 4) {
                    data = data.concat(Array(pad + 1).join(b64[64]));
                }
                return this.decode(data);
            }
        };
        module.exports = Base64;
    }, {} ],
    4: [ function(require, module, exports) {
        function extend() {
            var deep = false, source, target, key, i = 0, l = arguments.length;
            if (typeof arguments[i] === "boolean") deep = arguments[i++];
            target = arguments[i++];
            if (l <= i) return extend(deep, {}, target);
            while (i < l) {
                source = arguments[i++];
                for (key in source) {
                    if (typeof source[key] === "object" && source[key] != null) {
                        if (deep) {
                            if (target.hasOwnProperty(key)) extend(true, target[key], source[key]); else target[key] = extend(true, {}, source[key]);
                        }
                    } else if (source[key] !== undefined) {
                        target[key] = source[key];
                    }
                }
            }
            return target;
        }
        function inherit(self, parent) {
            self.super_ = parent;
            self.prototype = Object.create(parent.prototype, {
                constructor: {
                    value: self,
                    enumerable: false,
                    writable: true,
                    configurable: true
                }
            });
        }
        module.exports = {
            extend: extend,
            inherit: inherit
        };
    }, {} ],
    5: [ function(require, module, exports) {
        var urlParser = require("urlparser"), BROWSER, Xhr;
        try {
            BROWSER = !process.versions.node;
        } catch (e) {
            BROWSER = true;
        }
        if (!BROWSER) {
            Xhr = function(method, path, options, data, resolver) {
                "use strict";
                var url = urlParser.parse(path);
                var proto = url.host && url.host.protocol || options.protocol;
                var req = require(proto).request;
                delete options.protocol;
                if (options.timeout) {
                    req.socket.setTimeout(options.timeout);
                    delete options.timeout;
                }
                options.method = method;
                if (url.host) {
                    if (url.host.hostname) options.hostname = url.host.hostname;
                    url.host = null;
                }
                options.path = url.toString();
                if (!options.headers) options.headers = {};
                options.headers["content-length"] = data ? Buffer.byteLength(data) : 0;
                req(options, function(res) {
                    var buf = [];
                    res.on("data", function(chunk) {
                        buf[buf.length] = chunk;
                    }).on("end", function() {
                        buf = buf.join("");
                        reply(resolver, buf, res);
                    }).on("error", function(error) {
                        reply(resolver, error);
                    });
                }).on("error", function(error) {
                    reply(resolver, error);
                }).end(data, options.encoding);
            };
        } else {
            Xhr = function(method, path, options, data, resolver) {
                "use strict";
                var ajax = require("ajax"), buf;
                ajax(method, path, options, data).when(function(res) {
                    buf = res.responseText;
                    reply(resolver, buf, res);
                }, function(error) {
                    reply(resolver, error);
                });
            };
        }
        function reply(resolver, data, res) {
            var error;
            res = typeof res === "object" ? res : {
                status: res || -1
            };
            res.status = res.statusCode ? res.statusCode : res.status;
            if (typeof data === "string") {
                try {
                    data = JSON.parse(data);
                } catch (e) {}
            }
            if (!data) data = {
                code: res.status
            }; else if (typeof data === "object" && !data.code) data.code = res.status;
            if (0 < res.status && 399 > res.status) {
                if (typeof resolver === "function") {
                    return resolver(undefined, data, res);
                }
                return resolver.resolve(data, res);
            }
            error = data;
            if (typeof resolver === "function") {
                if (!(error instanceof Error)) {
                    if (typeof error === "object") {
                        error = new Error(JSON.stringify(data));
                        for (var k in data) error[k] = data[k];
                    } else {
                        error = new Error(data);
                    }
                }
                return resolver(error, res);
            }
            return resolver.reject(error, res);
        }
        module.exports = Xhr;
    }, {
        urlparser: 8,
        ajax: 9
    } ],
    8: [ function(require, module, exports) {
        var URL = /^(?:(?:([A-Za-z]+):?\/{2})?(?:(\w+)?:?([^\x00-\x1F^\x7F^:]*)@)?([\w\-\.]+)?(?::(\d+))?)\/?(([^\x00-\x1F^\x7F^\#^\?^:]+)?(?::([^\x00-\x1F^\x7F^\#^\?]+))?(?:#([^\x00-\x1F^\?]+))?)(?:\?(.*))?$/;
        function urlString(o) {
            var str = "";
            o = o ? o : this;
            str += hostString(o);
            str += pathString(o);
            str += queryString(o);
            return str;
        }
        module.exports.url = urlString;
        function hostString(o) {
            var str = "";
            o = o ? o.host : this.host;
            if (o) {
                if (o.protocol) str += o.protocol + "://";
                if (o.username) {
                    str += o.username + (o.password ? ":" + o.password : "") + "@";
                }
                if (o.hostname) str += o.hostname;
                if (o.port) str += ":" + o.port;
            }
            return str;
        }
        module.exports.host = hostString;
        function pathString(o) {
            var str = "";
            o = o ? o.path : this.path;
            if (o) {
                if (o.base) str += "/" + o.base;
                if (o.name) str += ":" + o.name;
                if (o.hash) str += "#" + o.hash;
            }
            return str;
        }
        module.exports.path = pathString;
        function queryString(o) {
            var str = "";
            o = o ? o.query : this.query;
            if (o) {
                str = "?";
                if (o.parts) str += o.parts.join("&");
            }
            return str;
        }
        module.exports.query = queryString;
        function urlParser(parse) {
            var param, ret = {};
            Object.defineProperty(ret, "toString", {
                enumerable: false,
                value: urlString
            });
            if (typeof parse === "string") {
                var q, p, u;
                u = URL.exec(parse);
                if (u[1] || u[4]) {
                    ret.host = {};
                    if (u[1]) ret.host.protocol = u[1];
                    if (u[2]) ret.host.username = u[2];
                    if (u[3]) ret.host.password = u[3];
                    if (u[4]) ret.host.hostname = u[4];
                    if (u[5]) ret.host.port = u[5];
                }
                if (u[6]) {
                    ret.path = {};
                    if (u[7]) ret.path.base = u[7];
                    if (u[8]) ret.path.name = u[8];
                    if (u[9]) ret.path.hash = u[9];
                }
                if (u[10]) {
                    ret.query = {};
                    ret.query.parts = u[10].split("&");
                    if (ret.query.parts.length) {
                        ret.query.params = {};
                        ret.query.parts.forEach(function(part) {
                            param = part.split("=");
                            ret.query.params[param[0]] = param[1];
                        });
                    }
                }
            }
            return ret;
        }
        module.exports.parse = urlParser;
    }, {} ],
    9: [ function(require, module, exports) {
        var urlParser = require("urlparser");
        var DEFAULT_TIMEOUT = 5e3;
        var Xhr = function() {
            if (window.XDomainRequest) {
                return window.XDomainRequest;
            } else if (window.XMLHttpRequest) {
                return window["XMLHttpRequest"];
            } else if (window.ActiveXObject) {
                [ "Msxml2.XMLHTTP.6.0", "Msxml2.XMLHTTP.3.0", "Microsoft.XMLHTTP" ].forEach(function(x) {
                    try {
                        return window.ActiveXObject(x);
                    } catch (e) {}
                });
                throw new Error("XHR ActiveXObject failed");
            }
            throw new Error("XHR support not found");
        }();
        var XHR_CLOSED = 0, XHR_OPENED = 1, XHR_SENT = 2, XHR_RECEIVED = 3, XHR_DONE = 4;
        function Ajax(method, url, options, data, res) {
            var xhr = new Xhr(), headers;
            if (typeof options === "function") {
                res = options;
                options = null;
                data = null;
            } else if (typeof data === "function") {
                res = data;
                data = null;
            }
            options = options ? options : {};
            if (typeof res === "function") {
                var clb = res;
                res = {
                    resolve: function(x) {
                        clb(undefined, x);
                    },
                    reject: function(x, c) {
                        clb(c || -1, x);
                    },
                    progress: function(x) {
                        clb(0, x);
                    }
                };
            } else if (typeof res !== "object") {
                res = {
                    resolve: function(x) {
                        this.result = x;
                        if (this.onfulfill) this.onfulfill(x);
                    },
                    reject: function(x) {
                        this.error = x;
                        if (this.onreject) this.onreject(x);
                    },
                    progress: function(x) {
                        if (this.onprogress) this.onprogress(x);
                    },
                    when: function(f, r, p) {
                        this.onfulfill = f;
                        this.onreject = r;
                        this.onprogress = p;
                    }
                };
                options.async = true;
            }
            if (options.async === undefined) options.async = true;
            if (options.timeout === undefined) options.timeout = DEFAULT_TIMEOUT;
            if (!options.headers) options.headers = {};
            if (options.type || !options.headers["content-type"]) options.headers["content-type"] = options.type || "application/json";
            if (options.accept || !options.headers.accept) options.headers.accept = options.accept || "application/json";
            if (options.charset) options.headers["accept-charset"] = options.charset;
            if ("withCredentials" in xhr || typeof XDomainRequest != "undefined") {
                if (options.withCredentials === true) xhr.withCredentials = true;
                xhr.onload = function() {
                    res.resolve(xhr);
                };
                xhr.onerror = function() {
                    res.reject(xhr);
                };
            } else {
                xhr.onreadystatechange = function() {
                    switch (xhr.readyState) {
                      case XHR_DONE:
                        if (xhr.status) res.resolve(xhr); else res.reject(xhr);
                        break;
                    }
                };
            }
            Object.defineProperty(xhr, "headers", {
                get: function() {
                    if (!headers) headers = parseHeaders(xhr.getAllResponseHeaders());
                    return headers;
                }
            });
            if (options.timeout) {
                setTimeout(function() {
                    xhr.abort();
                }, options.timeout);
            }
            if (xhr.upload && res.progress) {
                xhr.upload.onprogress = function(e) {
                    e.percent = e.loaded / e.total * 100;
                    res.progress(e);
                };
            }
            url = urlParser.parse(url);
            if (!url.host) url.host = {};
            if (!url.host.protocol && options.protocol) url.host.protocol = options.protocol;
            if (!url.host.hostname && options.hostname) url.host.hostname = options.hostname;
            if (!url.host.port && options.port) url.host.port = options.port;
            url = url.toString();
            try {
                xhr.open(method, url, options.async);
            } catch (error) {
                res.reject(error);
            }
            Object.keys(options.headers).forEach(function(header) {
                xhr.setRequestHeader(header, options.headers[header]);
            });
            if (data && typeof data !== "string" && options.headers["content-type"].indexOf("json") >= 0) {
                try {
                    data = JSON.stringify(data);
                } catch (error) {
                    res.reject(error);
                }
            }
            try {
                xhr.send(data);
            } catch (error) {
                res.reject(error);
            }
            return res;
        }
        if (!Object.create) {
            Object.create = function() {
                function F() {}
                return function(o) {
                    F.prototype = o;
                    return new F();
                };
            }();
        }
        function parseHeaders(h) {
            var ret = Object.create(null), key, val, i;
            h.split("\n").forEach(function(header) {
                if ((i = header.indexOf(":")) > 0) {
                    key = header.slice(0, i).replace(/^[\s]+|[\s]+$/g, "").toLowerCase();
                    val = header.slice(i + 1, header.length).replace(/^[\s]+|[\s]+$/g, "");
                    if (key && key.length) ret[key] = val;
                }
            });
            return ret;
        }
        [ "head", "get", "put", "post", "delete", "patch", "trace", "connect", "options" ].forEach(function(method) {
            Ajax[method] = function(url, options, data, res) {
                return Ajax(method, url, options, data, res);
            };
        });
        module.exports = Ajax;
    }, {
        urlparser: 8
    } ],
    6: [ function(require, module, exports) {
        var utils = require("./utils"), urlParser = require("urlparser");
        function path2db(path) {
            var o = {}, c = urlParser.parse(path);
            if (c.host) {
                o._server = {};
                utils.extend(o._server, c.host);
            }
            if (c.path) {
                if (c.path.base) o._name = c.path.base;
                if (c.path.name) o._collection = c.path.name;
            }
            return o;
        }
        function options(o) {
            if (!o || typeof o !== "object") return "";
            return Object.keys(o).reduce(function(a, b, c) {
                c = b + "=" + o[b];
                return !a ? "?" + c : a + "&" + c;
            }, "");
        }
        function ifMatch(id, options) {
            var headers, rev;
            if (options.match !== undefined) {
                rev = JSON.stringify(options.rev || id);
                if (options.match) headers = {
                    "if-match": rev
                }; else headers = {
                    "if-none-match": rev
                };
                delete options.match;
                delete options.rev;
            }
            return headers;
        }
        module.exports = {
            path2db: path2db,
            options: options,
            ifMatch: ifMatch
        };
    }, {
        "./utils": 4,
        urlparser: 8
    } ],
    7: [ function(require, module, exports) {
        var task = require("microtask");
        (function(root) {
            "use strict";
            try {
                root = window;
            } catch (e) {
                try {
                    root = global;
                } catch (f) {}
            }
            var slice = Array.prototype.slice, isArray = Array.isArray;
            var PENDING = 0, FULFILLED = 1, REJECTED = 2;
            function Promise(p) {
                var self = this;
                if (p && typeof p === "object") {
                    for (var k in Promise.prototype) p[k] = Promise.prototype[k];
                    p._promise = {
                        _chain: []
                    };
                    return p;
                }
                if (!(this instanceof Promise)) return new Promise(p);
                this._promise = {
                    _chain: []
                };
                if (typeof p === "function") {
                    task(function() {
                        var res = self.resolve.bind(self), rej = self.reject.bind(self), pro = self.progress.bind(self), tim = self.timeout.bind(self);
                        p(res, rej, pro, tim);
                    });
                }
            }
            Promise.resolver = function(p, r) {
                if (typeof r === "function") {
                    if (Promise.thenable(p)) {
                        return r(p.resolve, p.reject, p.progress, p.timeout);
                    } else if (p) {
                        return Promise.resolver(Promise(p), r);
                    } else return new Promise(r);
                }
                return new Promise(p);
            };
            Promise.thenable = function(p) {
                var then;
                if (p && (typeof p === "object" || typeof p === "function")) {
                    try {
                        then = p.then;
                    } catch (e) {
                        return false;
                    }
                }
                return typeof then === "function";
            };
            Promise.wrap = function(Klass, inst) {
                var p = new Promise();
                if (!Klass) throw Error("Nothing to wrap!");
                return function() {
                    var KC = Klass.prototype.constructor, args = slice.call(arguments), ret;
                    if (typeof KC === "function") {
                        try {
                            ret = KC.apply(inst, args);
                            if (!(ret instanceof Klass)) {
                                KC = function() {};
                                KC.prototype = Klass.prototype;
                                inst = new KC();
                                try {
                                    ret = Klass.apply(inst, args);
                                } catch (e) {
                                    p.reject(e);
                                    return;
                                }
                                ret = Object(ret) === ret ? ret : inst;
                            }
                            p.resolve(ret);
                        } catch (err) {
                            p.reject(err);
                        }
                    } else throw Error("not wrappable");
                    return p;
                };
            };
            Promise.defer = function() {
                var args = slice.call(arguments), f = args.shift(), p = new Promise();
                if (typeof f === "function") {
                    task(enclose, args);
                }
                function enclose() {
                    try {
                        p.resolve(f.apply(p, args));
                    } catch (err) {
                        p.reject(err);
                    }
                }
                return p;
            };
            Promise.async = function(func, cb) {
                var p = new Promise(), called;
                if (typeof func !== "function") throw new TypeError("func is not a function");
                var cb = typeof cb === "function" ? cb : function(err, ret) {
                    called = true;
                    if (err) p.reject(err); else if (err === 0) p.progress(ret); else p.fulfill(ret);
                };
                return function() {
                    var args = slice.call(arguments);
                    args.push(cb);
                    task(function() {
                        var ret;
                        try {
                            ret = func.apply(null, args);
                        } catch (err) {
                            cb(err);
                        }
                        if (ret !== undefined && !called) {
                            if (ret instanceof Error) cb(ret); else cb(undefined, ret);
                        }
                    });
                    return p;
                };
            };
            Promise.prototype.isPending = function() {
                return !this._promise._state;
            };
            Promise.prototype.isFulfilled = function() {
                return this._promise._state === FULFILLED;
            };
            Promise.prototype.isRejected = function() {
                return this._promise._state === REJECTED;
            };
            Promise.prototype.hasResolved = function() {
                return !!this._promise._state;
            };
            Promise.prototype.valueOf = function() {
                return this.isFulfilled() ? this._promise._value : undefined;
            };
            Promise.prototype.reason = function() {
                return this.isRejected() ? this._promise._value : undefined;
            };
            Promise.prototype.then = function(f, r, n) {
                var p = new Promise();
                this._promise._chain.push([ p, f, r, n ]);
                if (this._promise._state) task(traverse, [ this._promise ]);
                return p;
            };
            Promise.prototype.spread = function(f, r, n) {
                function s(v, a) {
                    if (!isArray(v)) v = [ v ];
                    return f.apply(f, v.concat(a));
                }
                return this.then(s, r, n);
            };
            Promise.prototype.done = function(f, r, n) {
                var self = this, p = this.then(f, catchError, n);
                function catchError(e) {
                    task(function() {
                        if (typeof r === "function") r(e); else if (typeof self.onerror === "function") {
                            self.onerror(e);
                        } else if (Promise.onerror === "function") {
                            Promise.onerror(e);
                        } else throw e;
                    });
                }
            };
            Promise.prototype.end = function(callback) {
                this.then(callback, function(e) {
                    if (!(e instanceof Error)) {
                        e = new Error(e);
                    }
                    if (typeof callback === "function") callback(e); else throw e;
                });
            };
            Promise.prototype.catch = function(errBack) {
                this.done(undefined, errBack);
            };
            Promise.prototype.fulfill = function(value, opaque) {
                if (!this._promise._state) {
                    this._promise._state = FULFILLED;
                    this._promise._value = value;
                    this._promise._opaque = opaque;
                    task(traverse, [ this._promise ]);
                }
                return this;
            };
            Promise.prototype.reject = function(reason, opaque) {
                if (!this._promise._state) {
                    this._promise._state = REJECTED;
                    this._promise._value = reason;
                    this._promise._opaque = opaque;
                    task(traverse, [ this._promise ]);
                }
                return this;
            };
            Promise.prototype.resolve = function(x, o) {
                var then, z, p = this;
                if (!this._promise._state) {
                    if (x === p) p.reject(new TypeError("Promise cannot resolve itself!"));
                    if (x && (typeof x === "object" || typeof x === "function")) {
                        try {
                            then = x.then;
                        } catch (e) {
                            p.reject(e);
                        }
                    }
                    if (typeof then !== "function") {
                        this.fulfill(x, o);
                    } else if (!z) {
                        try {
                            then.apply(x, [ function(y) {
                                if (!z) {
                                    p.resolve(y, o);
                                    z = true;
                                }
                            }, function(r) {
                                if (!z) {
                                    p.reject(r);
                                    z = true;
                                }
                            } ]);
                        } catch (e) {
                            if (!z) {
                                p.reject(e);
                                z = true;
                            }
                        }
                    }
                }
                return this;
            };
            Promise.prototype.progress = function() {
                var notify, chain = this._promise._chain;
                for (var i = 0, l = chain.length; i < l; i++) {
                    if (typeof (notify = chain[i][2]) === "function") notify.apply(this, arguments);
                }
            };
            Promise.prototype.timeout = function(msec, func) {
                var p = this;
                if (msec === null) {
                    if (this._promise._timeout) root.clearTimeout(this._promise._timeout);
                    this._promise._timeout = null;
                } else if (!this._promise._timeout) {
                    this._promise._timeout = root.setTimeout(onTimeout, msec);
                }
                function onTimeout() {
                    var e = new RangeError("exceeded timeout");
                    if (!this._promise._state) {
                        if (typeof func === "function") func(p); else if (typeof p.onerror === "function") p.onerror(e); else throw e;
                    }
                }
                return this;
            };
            Promise.prototype.callback = function(callback) {
                return this.then(function(value, opaque) {
                    return callback(undefined, value, opaque);
                }, function(reason, opaque) {
                    var error = reason;
                    if (!(error instanceof Error)) {
                        if (typeof reason === "object") {
                            error = new Error(JSON.stringify(reason));
                            for (var k in reason) error[k] = reason[k];
                        } else {
                            error = new Error(reason);
                        }
                    }
                    return callback(error, opaque);
                }, function(progress) {
                    return callback(0, progress);
                });
            };
            Promise.prototype.join = function(j) {
                var p = this, y = [], u = new Promise().resolve(p).then(function(v) {
                    y[0] = v;
                });
                if (arguments.length > 1) {
                    j = slice.call(arguments);
                }
                if (!isArray(j)) j = [ j ];
                function stop(error) {
                    u.reject(error);
                }
                function collect(i) {
                    j[i].then(function(v) {
                        y[i + 1] = v;
                    }).catch(stop);
                    return function() {
                        return j[i];
                    };
                }
                for (var i = 0; i < j.length; i++) {
                    u = u.then(collect(i));
                }
                return u.then(function() {
                    return y;
                });
            };
            function traverse(_promise) {
                var l, tuple = _promise._chain;
                if (!tuple.length) return;
                var t, p, h, v = _promise._value;
                while (t = tuple.shift()) {
                    p = t[0];
                    h = t[_promise._state];
                    if (typeof h === "function") {
                        try {
                            v = h(_promise._value, _promise._opaque);
                            p.resolve(v, _promise._opaque);
                        } catch (e) {
                            p.reject(e);
                        }
                    } else {
                        p._promise._state = _promise._state;
                        p._promise._value = v;
                        p._promise._opaque = _promise._opaque;
                        task(traverse, [ p._promise ]);
                    }
                }
            }
            if (module && module.exports) module.exports = Promise; else if (typeof define === "function" && define.amd) define(Promise); else root.Promise = Promise;
        })(this);
    }, {
        microtask: 10
    } ],
    10: [ function(require, module, exports) {
        (function(root) {
            "use strict";
            try {
                root = global;
            } catch (e) {
                try {
                    root = window;
                } catch (e) {}
            }
            var defer, deferred, observer, queue = [];
            if (root.process && typeof root.process.nextTick === "function") {
                if (root.setImmediate && root.process.versions.node.split(".")[1] > "10") defer = root.setImmediate; else defer = root.process.nextTick;
            } else if (root.vertx && typeof root.vertx.runOnLoop === "function") defer = root.vertx.RunOnLoop; else if (root.vertx && typeof root.vertx.runOnContext === "function") defer = root.vertx.runOnContext; else if (observer = root.MutationObserver || root.WebKitMutationObserver) {
                defer = function(document, observer, drain) {
                    var el = document.createElement("div");
                    new observer(drain).observe(el, {
                        attributes: true
                    });
                    return function() {
                        el.setAttribute("x", "y");
                    };
                }(document, observer, drain);
            } else if (typeof root.setTimeout === "function" && (root.ActiveXObject || !root.postMessage)) {
                defer = function(f) {
                    root.setTimeout(f, 0);
                };
            } else if (root.MessageChannel && typeof root.MessageChannel === "function") {
                var fifo = [], channel = new root.MessageChannel();
                channel.port1.onmessage = function() {
                    fifo.shift()();
                };
                defer = function(f) {
                    fifo[fifo.length] = f;
                    channel.port2.postMessage(0);
                };
            } else if (typeof root.setTimeout === "function") defer = function(f) {
                root.setTimeout(f, 0);
            }; else throw new Error("No candidate for microtask defer()");
            deferred = head;
            function microtask(func, args, context) {
                if (typeof func !== "function") throw new Error("microtask: func argument is not a function!");
                deferred(func, args, context);
            }
            function head(func, args, context) {
                queue[queue.length] = [ func, args, context ];
                deferred = tail;
                defer(drain);
            }
            function tail(func, args, context) {
                queue[queue.length] = [ func, args, context ];
            }
            function drain() {
                var q;
                for (var i = 0; i < queue.length; i++) {
                    q = queue[i];
                    try {
                        q[0].apply(q[2], q[1]);
                    } catch (e) {
                        defer(function() {
                            throw e;
                        });
                    }
                }
                deferred = head;
                queue = [];
            }
            if (module && module.exports) module.exports = microtask; else if (typeof define === "function" && define.amd) define(microtask); else root.microtask = microtask;
        })(this);
    }, {} ]
}, {}, {
    "1": ""
});