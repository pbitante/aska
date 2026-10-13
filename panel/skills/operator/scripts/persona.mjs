#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap3 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar3 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq2 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar3(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap3;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar3;
    exports.isSeq = isSeq2;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str2) => str2.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent2) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent2 ? comment.replace(/^(?! *$)/gm, indent2) : comment;
    }
    var lineComment = (str2, indent2, comment) => str2.endsWith("\n") ? indentComment(comment, indent2) : comment.includes("\n") ? "\n" + indentComment(comment, indent2) : (str2.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent2, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent2.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent2.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent2.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent2.length);
          end = i + indent2.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent2}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent2}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent2) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent2) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str2) => /^(%|---|\.\.\.)/m.test(str2);
    function lineLengthOverLimit(str2, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str2.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str2[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent2 = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str2 = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str2 += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str2 += json.slice(start, i);
                const code2 = json.substr(i + 2, 4);
                switch (code2) {
                  case "0000":
                    str2 += "\\0";
                    break;
                  case "0007":
                    str2 += "\\a";
                    break;
                  case "000b":
                    str2 += "\\v";
                    break;
                  case "001b":
                    str2 += "\\e";
                    break;
                  case "0085":
                    str2 += "\\N";
                    break;
                  case "00a0":
                    str2 += "\\_";
                    break;
                  case "2028":
                    str2 += "\\L";
                    break;
                  case "2029":
                    str2 += "\\P";
                    break;
                  default:
                    if (code2.substr(0, 2) === "00")
                      str2 += "\\x" + code2.substr(2);
                    else
                      str2 += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str2 += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str2 += "\n";
                  i += 2;
                }
                str2 += indent2;
                if (json[i + 2] === " ")
                  str2 += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str2 = start ? str2 + json.slice(start) : json;
      return implicitKey ? str2 : foldFlowLines.foldFlowLines(str2, indent2, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent2 = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent2}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent2, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent2 = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent2.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent2}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent2}`);
      }
      const indentSize = indent2 ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent2}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent2, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent2}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent2}`);
      return `|${header}
${indent2}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent: indent2, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent2 === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent2 === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str2 = value.replace(/\n+/g, `$&
${indent2}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str2);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str2 : foldFlowLines.foldFlowLines(str2, indent2, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify2(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str2 = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str2;
      return identity.isScalar(node) || str2[0] === "{" || str2[0] === "[" ? `${props} ${str2}` : `${props}
${ctx.indent}${str2}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify2;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent: indent2, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent2 + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str2 = stringify2.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str2.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str2 === "" ? "?" : explicitKey ? `? ${str2}` : str2;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str2 = `? ${str2}`;
        if (keyComment && !keyCommentDone) {
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str2;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
        str2 = `? ${str2}
${indent2}:`;
      } else {
        str2 = `${str2}:`;
        if (keyComment)
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str2.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify2.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str2 += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str2;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn2(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn2;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify2 = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify2.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify3 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify3(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent: indent2, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str3 = stringify2.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str3 += stringifyComment.lineComment(str3, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str3);
      }
      let str2;
      if (lines.length === 0) {
        str2 = flowChars.start + flowChars.end;
      } else {
        str2 = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str2 += line ? `
${indent2}${line}` : "\n";
        }
      }
      if (comment) {
        str2 += "\n" + stringifyComment.indentComment(commentString(comment), indent2);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str2;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent: indent2, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str2 = stringify2.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str2.includes("\n"));
        if (i < items.length - 1) {
          str2 += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str2.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str2 += ",";
          }
        }
        if (comment)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment));
        lines.push(str2);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str2 = start;
          for (const line of lines)
            str2 += line ? `
${indentStep}${indent2}${line}` : "\n";
          return `${str2}
${indent2}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent: indent2, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent2);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del2 = this.items.splice(this.items.indexOf(it), 1);
        return del2.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del2 = this.items.splice(idx, 1);
        return del2.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str2) => str2,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str2) => new Scalar.Scalar(str2[0] === "t" || str2[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str2) => str2.slice(-3).toLowerCase() === "nan" ? NaN : str2[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str2) => parseFloat(str2),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str2) {
        const node = new Scalar.Scalar(parseFloat(str2));
        const dot = str2.indexOf(".");
        if (dot !== -1 && str2[str2.length - 1] === "0")
          node.minFractionDigits = str2.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str2, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str2) : parseInt(str2.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str2) => str2,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str2) => str2 === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str2, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str2) : parseInt(str2, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str2) => parseFloat(str2),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str2, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str2)}`);
        return str2;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str2 = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str2.length);
          for (let i = 0; i < str2.length; ++i)
            buffer[i] = str2.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str2;
        if (typeof node_buffer.Buffer === "function") {
          str2 = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str2 = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str2.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str2.substr(o, lineWidth);
          }
          str2 = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str2 }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str2) => str2.slice(-3).toLowerCase() === "nan" ? NaN : str2[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str2) => parseFloat(str2.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str2) {
        const node = new Scalar.Scalar(parseFloat(str2.replace(/_/g, "")));
        const dot = str2.indexOf(".");
        if (dot !== -1) {
          const f = str2.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str2, offset, radix, { intAsBigInt }) {
      const sign = str2[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str2 = str2.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str2 = `0b${str2}`;
            break;
          case 8:
            str2 = `0o${str2}`;
            break;
          case 16:
            str2 = `0x${str2}`;
            break;
        }
        const n2 = BigInt(str2);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str2, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str2 = value.toString(radix);
        return value < 0 ? "-" + prefix + str2.substr(1) : prefix + str2;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str2, asBigInt) {
      const sign = str2[0];
      const parts = sign === "-" || sign === "+" ? str2.substring(1) : str2;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str2, _onError, { intAsBigInt }) => parseSexagesimal(str2, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str2) => parseSexagesimal(str2, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str2) {
        const match = str2.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify2.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify2.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify2.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code2, message) {
        super();
        this.name = name;
        this.code = code2;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code2, message) {
        super("YAMLParseError", pos, code2, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code2, message) {
        super("YAMLWarning", pos, code2, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent2, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent2 && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep2, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep2?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep2) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep2 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep2, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep2 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep2 + cb;
              sep2 = "";
              break;
            }
            case "newline":
              if (comment)
                sep2 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap3 = fc.start.source === "{";
      const fcName = isMap3 ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap3 ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep2, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep2?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep2 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap3 && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap3 && !sep2 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep2, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep2 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap3 && !props.found && ctx.options.strict) {
              if (sep2)
                for (const st of sep2) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep2, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap3) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap3 ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent2, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent2.length > trimIndent)
            trimIndent = indent2.length;
        } else {
          if (indent2.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent2.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent2.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent2.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep2 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent2, content] = lines[i];
        offset += indent2.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent2.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent2 = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep2 + indent2.slice(trimIndent) + content;
          sep2 = "\n";
        } else if (indent2.length > trimIndent || content[0] === "	") {
          if (sep2 === " ")
            sep2 = "\n";
          else if (!prevMoreIndented && sep2 === "\n")
            sep2 = "\n\n";
          value += sep2 + indent2.slice(trimIndent) + content;
          sep2 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep2 === "\n")
            value += "\n";
          else
            sep2 = "\n";
        } else {
          value += sep2 + content;
          sep2 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent2 = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent2 && n)
            indent2 = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent: indent2, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code2, msg) => onError(offset + rel, code2, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line = /(.*?)\r?\n/sy;
      let match = line.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep2 = " ";
      let pos = line.lastIndex;
      while (match = line.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep2 === "\n")
            res += sep2;
          else
            sep2 = "\n";
        } else {
          res += sep2 + lm;
          sep2 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep2 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code2 = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code2);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code2, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code2, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code2, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code2, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code2, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code2, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent: indent2, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent2 > 0 ? " ".repeat(indent2) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent: indent2, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent: indent2, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent: indent2, source: "\n" });
          return { type: "block-scalar", offset, indent: indent2, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent: indent2, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent: indent2, source, end };
        default:
          return { type: "scalar", offset, indent: indent2, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent2 = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent2 === "number")
        indent2 += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent2 === null,
        indent: indent2 !== null && indent2 > 0 ? " ".repeat(indent2) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent2 = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent: indent2, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent: indent2, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent: indent2, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent2 = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent: indent2, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify2 = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep2, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep2)
        for (const st of sep2)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify2;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar3 = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar3;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent2 = 0;
          while (ch === " ")
            ch = this.buffer[++indent2 + offset];
          if (ch === "\r") {
            const next = this.buffer[indent2 + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent2 + 1;
          }
          return ch === "\n" || indent2 >= this.indentNext || !ch && !this.atEnd ? offset + indent2 : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent2 = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent2 = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent2 !== -1 && indent2 < this.indentNext && line[0] !== "#" || indent2 === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent2 === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent2 = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent2 += 1;
              break;
            case "\n":
              nl = i2;
              indent2 = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent2 >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent2;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent2 > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter2 = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter2;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list3, type) {
      for (let i = 0; i < list3.length; ++i)
        if (list3[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list3) {
      for (let i = 0; i < list3.length; ++i) {
        switch (list3[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep2;
          if (scalar.end) {
            sep2 = scalar.end;
            sep2.push(this.sourceToken);
            delete scalar.end;
          } else
            sep2 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep2 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep2 = it.sep;
                  sep2.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep2 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep2 = fc.end.splice(1, fc.end.length);
            sep2.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep2 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent2) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent2)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument3(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument3(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify2(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent2 = Math.round(options);
        options = indent2 < 1 ? void 0 : indent2 > 8 ? { indent: 8 } : { indent: indent2 };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument3;
    exports.stringify = stringify2;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/cli/bin.ts
import { readFileSync as readFileSync13 } from "node:fs";
import { homedir } from "node:os";
import { dirname as dirname6, resolve as resolve6 } from "node:path";
import { isatty } from "node:tty";
import { fileURLToPath } from "node:url";

// src/scopes/discover.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2, readFileSync as readFileSync2, statSync as statSync2 } from "node:fs";
import { dirname, join, resolve as resolve2 } from "node:path";

// src/diagnostics.ts
function err(code2, message, loc, fix) {
  return { level: "error", code: code2, message, loc, fix };
}
function warn(code2, message, loc, fix) {
  return { level: "warning", code: code2, message, loc, fix };
}
function hasErrors(ds) {
  return ds.some((d) => d.level === "error");
}
function formatDiagnostic(d) {
  const where = d.loc ? ` ${d.loc.file}:${d.loc.line}` : "";
  const head = `${d.level} ${d.code}${where} \u2014 ${d.message}`;
  return d.fix ? `${head}
    fix: ${d.fix}` : head;
}
function distance(a, b) {
  const row2 = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row2[0];
    row2[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row2[j];
      row2[j] = Math.min(row2[j] + 1, row2[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row2[b.length];
}
function didYouMean(name, candidates) {
  let best;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = distance(name, c);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best !== void 0 && bestDistance <= Math.max(1, Math.floor(name.length / 3)) ? best : void 0;
}

// src/fs.ts
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
function writeAtomic(path, content) {
  const target = existsSync(path) && lstatSync(path).isSymbolicLink() ? realpathSync(path) : path;
  const mode = existsSync(target) ? statSync(target).mode & 4095 : void 0;
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, content);
    if (mode !== void 0) chmodSync(tmp, mode);
    renameSync(tmp, target);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}
function readIfExists(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return void 0;
  }
}
function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// src/model/types.ts
var SEVERITIES = ["low", "medium", "high", "critical"];
var severityRank = (s) => SEVERITIES.indexOf(s);
var cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var TIERS = ["primary", "secondary", "deprioritized"];
var PANEL_MODELS = ["haiku", "sonnet", "opus", "fable"];
var isPanelModel = (v) => PANEL_MODELS.includes(v);

// src/scopes/discover.ts
var isDir = (p) => {
  try {
    return statSync2(p).isDirectory();
  } catch {
    return false;
  }
};
function sameDir(a, b) {
  return safeRealpath(a) === safeRealpath(b);
}
function findGitRoot(start) {
  for (let d = resolve2(start); ; d = dirname(d)) {
    if (existsSync2(join(d, ".git"))) return d;
    if (dirname(d) === d) return void 0;
  }
}
function locateProject(cwd2) {
  const start = resolve2(cwd2);
  const git = findGitRoot(start);
  if (!git) return isDir(join(start, ".claude")) ? { base: start, claudeDir: join(start, ".claude") } : { base: start };
  for (let d = start; ; d = dirname(d)) {
    if (isDir(join(d, ".claude"))) return { base: git, claudeDir: join(d, ".claude") };
    if (d === git || dirname(d) === d) break;
  }
  return { base: git };
}
function manifestName(root) {
  try {
    const m = JSON.parse(readFileSync2(join(root, ".claude-plugin", "plugin.json"), "utf8"));
    return typeof m.name === "string" && m.name !== "" ? m.name : void 0;
  } catch {
    return void 0;
  }
}
var listWarning = (why) => warn("W_PLUGIN_LIST", `${why}; other plugins' personas and units are unavailable`, void 0, 'Make sure the claude CLI is on PATH and "claude plugin list --json" works');
var nameWarning = (namespace) => warn(
  "W_PLUGIN_NAME",
  `plugin namespace "${namespace}" is not valid and was skipped`,
  void 0,
  'Rename the plugin or its manifest "name" so it is not empty and does not contain ":" or "/"'
);
var duplicateWarning = (plugin, a, b) => warn(
  "W_PLUGIN_DUPLICATE",
  `plugin namespace "${plugin}" is installed more than once`,
  void 0,
  `Installed at both "${a}" and "${b}"; disable one`
);
function parsePluginList(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return { scopes: [], diagnostics: [listWarning("could not parse the plugin list")] };
  }
  if (!Array.isArray(data)) return { scopes: [], diagnostics: [listWarning("the plugin list is not a JSON array")] };
  const diagnostics = [];
  const scopes = [];
  for (const p of data) {
    if (typeof p !== "object" || p === null) continue;
    const { id, enabled, installPath } = p;
    if (enabled !== true || typeof installPath !== "string") continue;
    const manifest = manifestName(installPath);
    const namespace = manifest ?? (typeof id === "string" ? id.split("@")[0] : void 0);
    if (namespace === void 0) continue;
    if (namespace === "" || namespace.includes(":") || namespace.includes("/")) {
      diagnostics.push(nameWarning(namespace));
      continue;
    }
    scopes.push({ kind: "plugin", root: resolve2(installPath), plugin: namespace });
  }
  scopes.sort((a, b) => cmp(a.plugin, b.plugin) || cmp(a.root, b.root));
  const seen = /* @__PURE__ */ new Map();
  const deduped = [];
  for (const s of scopes) {
    const existing = seen.get(s.plugin);
    if (existing) {
      diagnostics.push(duplicateWarning(s.plugin, existing.root, s.root));
      continue;
    }
    seen.set(s.plugin, s);
    deduped.push(s);
  }
  return { scopes: deduped, diagnostics };
}
var PLUGIN_LIST_TIMEOUT_MS = 2e4;
function runPluginList(cwd2, timeoutMs = PLUGIN_LIST_TIMEOUT_MS) {
  try {
    return {
      json: execFileSync("claude", ["plugin", "list", "--json"], {
        encoding: "utf8",
        timeout: timeoutMs,
        stdio: ["ignore", "pipe", "pipe"],
        ...cwd2 !== void 0 ? { cwd: cwd2 } : {}
      })
    };
  } catch (e) {
    const x = e;
    const firstLine = (x.stderr ?? "").split("\n").map((l) => l.trim()).find((l) => l !== "");
    const cause = x.code === "ENOENT" ? "claude is not on PATH" : x.code === "ETIMEDOUT" ? `no answer within ${timeoutMs / 1e3}s` : x.signal ? `killed by ${x.signal}` : typeof x.status === "number" ? `exit code ${x.status}${firstLine ? `: ${firstLine}` : ""}` : x.message;
    return { reason: `could not run "claude plugin list --json" (${cause})` };
  }
}
function discoverScopes(o) {
  const diagnostics = [];
  const located = locateProject(o.cwd);
  const userRoot = join(resolve2(o.home), ".claude");
  const dropped = located.claudeDir !== void 0 && sameDir(located.claudeDir, userRoot);
  const project = dropped ? { base: located.base, droppedClaudeDir: located.claudeDir } : located;
  const scopes = [];
  if (project.claudeDir) scopes.push({ kind: "project", root: project.claudeDir });
  scopes.push({ kind: "user", root: userRoot });
  if (o.pluginListJson === void 0) {
    diagnostics.push(listWarning(o.pluginListUnavailableReason ?? 'could not run "claude plugin list --json"'));
  } else {
    const p = parsePluginList(o.pluginListJson);
    scopes.push(...p.scopes);
    diagnostics.push(...p.diagnostics);
  }
  if (o.selfPluginRoot !== void 0) {
    const name = manifestName(o.selfPluginRoot);
    if (name !== void 0 && (name === "" || name.includes(":") || name.includes("/"))) {
      diagnostics.push(nameWarning(name));
    } else if (name && !scopes.some((s) => s.kind === "plugin" && s.plugin === name)) {
      scopes.push({ kind: "plugin", root: resolve2(o.selfPluginRoot), plugin: name });
    }
  }
  const nonPlugin = scopes.filter((s) => s.kind !== "plugin");
  const plugin = scopes.filter((s) => s.kind === "plugin").sort((a, b) => a.plugin < b.plugin ? -1 : a.plugin > b.plugin ? 1 : 0);
  return { scopes: [...nonPlugin, ...plugin], project, diagnostics };
}

// src/cli/main.ts
import { statSync as statSync6 } from "node:fs";
import { dirname as dirname5, join as join7, resolve as resolve5 } from "node:path";

// src/cli/judgment.ts
import { readFileSync as readFileSync3 } from "node:fs";

// src/evidence/validate.ts
var EVIDENCE_SECTIONS = ["Checked", "Ran", "Found", "Not determined"];
var HEADING = /^##(?!#)\s+(.*?)\s*$/;
var FENCE = /^\s*(`{3,}|~{3,})/;
var CLOSE = /^\s*(`{3,}|~{3,})\s*$/;
var list = EVIDENCE_SECTIONS.map((s) => `"## ${s}"`).join(", ");
function validateEvidence(text) {
  if (text.trim() === "") return ["no input"];
  const sections = [];
  let preamble = false;
  let fence;
  let fenceLine = 0;
  for (const [i, line] of text.split("\n").entries()) {
    const f = FENCE.exec(line)?.[1];
    if (fence !== void 0) {
      const c = CLOSE.exec(line)?.[1];
      if (c !== void 0 && c[0] === fence[0] && c.length >= fence.length) fence = void 0;
    } else if (f !== void 0) {
      fence = f;
      fenceLine = i + 1;
    } else {
      const h = HEADING.exec(line);
      if (h) {
        sections.push({ name: h[1], body: [] });
        continue;
      }
    }
    if (sections.length === 0) preamble ||= line.trim() !== "";
    else sections[sections.length - 1].body.push(line);
  }
  const v = [];
  if (preamble) v.push('text before "## Checked"; reply with only the four sections');
  if (fence !== void 0) return [...v, `a code fence opened on line ${fenceLine} is never closed; close it so the sections after it can be read`];
  const known = EVIDENCE_SECTIONS;
  for (const s of sections) if (!known.includes(s.name)) v.push(`unexpected section "## ${s.name}"`);
  for (const name of EVIDENCE_SECTIONS) {
    const found = sections.filter((s) => s.name === name);
    if (found.length === 0) v.push(`missing section "## ${name}"`);
    else if (found.length > 1) v.push(`section "## ${name}" appears more than once`);
    else if (found[0].body.every((l) => l.trim() === "")) v.push(`section "## ${name}" is empty; write "Nothing" if there is nothing to say`);
  }
  const order2 = EVIDENCE_SECTIONS.map((name) => sections.findIndex((s) => s.name === name)).filter((i) => i >= 0);
  if (order2.some((i, k) => k > 0 && i < order2[k - 1])) v.push(`sections out of order: expected ${list}`);
  return v;
}

// src/gate/targets.ts
var HEADING2 = /^ {0,3}#{2}\s+adversarial review targets(?:\s+#+)?\s*$/i;
var SECTION_END = /^ {0,3}#{1,2}(?:\s|$)/;
var PROSE_BREAK = /^(?: {0,3}#{3,6}(?:\s|$)| ?1[.)]\s+\S)/;
var BULLET = /^\s*[-*+](?:\s+(.*))?$/;
var THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
var FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
var FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;
function fenceSkip(line, state) {
  if (state.inFence) {
    const close = FENCE_CLOSE.exec(line);
    if (close && close[1][0] === state.char && close[1].length >= state.len) state.inFence = false;
    return true;
  }
  const open = FENCE_OPEN.exec(line);
  if (open) {
    state.inFence = true;
    state.char = open[1][0];
    state.len = open[1].length;
    return true;
  }
  return false;
}
function leadingIndent(line) {
  let col = 0;
  for (const ch of line) {
    if (ch === " ") col += 1;
    else if (ch === "	") col += 4 - col % 4;
    else break;
  }
  return col;
}
function findSectionStart(lines) {
  const fence = { inFence: false, char: "", len: 0 };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fenceSkip(line, fence)) continue;
    if (HEADING2.test(line)) return i;
  }
  return -1;
}
function extractTargets(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = findSectionStart(lines);
  if (start < 0) return { error: "no-section" };
  const items = [];
  let lastTop;
  let childIndent;
  let lastChild;
  let current;
  let justSawBlank = false;
  let ignoringProse = false;
  const fence = { inFence: false, char: "", len: 0 };
  for (const line of lines.slice(start + 1)) {
    if (fenceSkip(line, fence)) continue;
    if (SECTION_END.test(line)) break;
    if (line.trim() === "") {
      justSawBlank = true;
      ignoringProse = false;
      continue;
    }
    if (THEMATIC_BREAK.test(line)) {
      justSawBlank = true;
      ignoringProse = false;
      continue;
    }
    const indent2 = leadingIndent(line);
    const bullet = BULLET.exec(line);
    if (bullet) {
      const text = (bullet[1] ?? "").trim();
      justSawBlank = false;
      ignoringProse = false;
      if (indent2 < 2 || !lastTop) {
        const item = { parts: [text], children: [] };
        items.push(item);
        lastTop = item;
        childIndent = void 0;
        lastChild = void 0;
        current = item;
        continue;
      }
      if (text === "") continue;
      if (childIndent === void 0 || indent2 <= childIndent) {
        childIndent ??= indent2;
        const child = { parts: [text] };
        lastTop.children.push(child);
        lastChild = child;
        current = child;
      } else if (lastChild) {
        lastChild.parts.push(text);
        current = lastChild;
      } else {
        const child = { parts: [text] };
        lastTop.children.push(child);
        lastChild = child;
        current = child;
      }
      continue;
    }
    if (ignoringProse) continue;
    if (PROSE_BREAK.test(line)) {
      ignoringProse = true;
      justSawBlank = false;
      continue;
    }
    if (indent2 > 0 && current) {
      current.parts.push(line.trim());
      justSawBlank = false;
      continue;
    }
    if (!justSawBlank && current) {
      current.parts.push(line.trim());
    } else {
      ignoringProse = true;
    }
    justSawBlank = false;
  }
  const targets = [];
  const emitted = items.filter((item) => item.children.length > 0 || item.parts.join(" ").trim() !== "");
  emitted.forEach((item, i) => {
    const text = item.parts.join(" ").trim();
    if (item.children.length === 0) {
      targets.push({ id: `T${i + 1}`, text });
      return;
    }
    const prefix = text.replace(/:\s*$/, "").trim();
    item.children.forEach((c, k) => {
      const childText = c.parts.join(" ").trim();
      targets.push({ id: `T${i + 1}.${k + 1}`, text: prefix === "" ? childText : `${prefix} \u2014 ${childText}` });
    });
  });
  return targets.length > 0 ? { targets } : { error: "no-bullets" };
}
function parseTargetsFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "the targets file is not valid JSON" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { error: "the targets file must be a JSON object" };
  const list3 = data.targets;
  if (!Array.isArray(list3) || list3.length === 0) return { error: 'the targets file needs a non-empty "targets" list' };
  const seen = /* @__PURE__ */ new Set();
  const targets = [];
  for (const [i, t] of list3.entries()) {
    const rawId = t?.id;
    const rawText = t?.text;
    const id = typeof rawId === "string" ? rawId.trim() : rawId;
    const tx = typeof rawText === "string" ? rawText.trim() : rawText;
    if (typeof id !== "string" || id === "" || typeof tx !== "string" || tx === "") {
      return { error: `targets[${i}] needs a non-empty "id" and "text"` };
    }
    if (seen.has(id)) return { error: `targets[${i}]: duplicate id "${id}"` };
    seen.add(id);
    targets.push({ id, text: tx });
  }
  return { targets };
}

// src/model/effective.ts
var effectiveThreshold = (u) => u.tier === "deprioritized" ? "critical" : u.thresholdSet ?? u.unit.threshold;
function inputId(f) {
  const scope = f.scope.kind === "plugin" ? `plugin:${f.scope.plugin}` : f.scope.kind;
  return `${scope}/${f.name}.${f.kind}.md`;
}

// src/judgment/validate.ts
var VERDICTS = ["proceed", "proceed-with-conditions", "stop", "insufficient-information"];
var TOP_KEYS = ["persona", "verdict", "conditions", "missing", "findings", "cleared", "not_applicable", "sections", "investigate", "checks"];
var FINDING_KEYS = ["unit", "severity", "claim", "evidence", "suggestion", "check"];
var CHECK_KEYS = ["id", "status", "evidence", "needs"];
var CHECK_STATUSES = ["holds", "broken", "deferred"];
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var nonEmpty = (v) => typeof v === "string" && v.trim() !== "";
var isSeverity = (v) => typeof v === "string" && SEVERITIES.includes(v);
function validateJudgment(p, j, targets) {
  if (!isObj(j)) return ["the judgment must be a JSON object"];
  const v = [];
  for (const k of Object.keys(j)) if (!TOP_KEYS.includes(k)) v.push(`unknown key "${k}"`);
  if (j.persona !== p.canonical) v.push(`persona must be "${p.canonical}"`);
  const verdict = j.verdict;
  const verdictValid = typeof verdict === "string" && VERDICTS.includes(verdict);
  if (!verdictValid) v.push(`verdict must be one of ${VERDICTS.join(", ")}`);
  const conditional = (key, verdictNeeding) => {
    const needed = verdict === verdictNeeding;
    const value = j[key];
    if (needed && !(Array.isArray(value) && value.length > 0 && value.every(nonEmpty))) {
      v.push(`${key} must be a non-empty list of strings when the verdict is ${verdictNeeding}`);
    }
    if (!needed && value !== void 0) v.push(`${key} is only allowed when the verdict is ${verdictNeeding}`);
  };
  if (verdictValid) {
    conditional("conditions", "proceed-with-conditions");
    conditional("missing", "insufficient-information");
  }
  const active = /* @__PURE__ */ new Map();
  for (const t of TIERS) for (const u of p.units[t]) active.set(u.canonical, u);
  const flagged = /* @__PURE__ */ new Set();
  const severities = [];
  const status = /* @__PURE__ */ new Map();
  const linkedChecks = /* @__PURE__ */ new Set();
  const targetIds = targets?.map((t) => t.id) ?? [];
  if (targets === void 0) {
    if (j.checks !== void 0) v.push("checks is only allowed when a targets file is given");
  } else if (!Array.isArray(j.checks)) {
    v.push("checks must be a list with one entry per target");
  } else {
    const seen = /* @__PURE__ */ new Set();
    j.checks.forEach((c, i) => {
      const at = `checks[${i}]`;
      if (!isObj(c)) {
        v.push(`${at} must be an object`);
        return;
      }
      for (const k of Object.keys(c)) if (!CHECK_KEYS.includes(k)) v.push(`${at}: unknown key "${k}"`);
      const st = c.status;
      const stValid = typeof st === "string" && CHECK_STATUSES.includes(st);
      if (!stValid) v.push(`${at}: status must be one of ${CHECK_STATUSES.join(", ")}`);
      if (typeof c.id !== "string" || !targetIds.includes(c.id)) v.push(`${at}: id "${String(c.id)}" is not a target`);
      else if (seen.has(c.id)) v.push(`${at}: target ${c.id} is answered more than once`);
      else {
        seen.add(c.id);
        if (stValid) status.set(c.id, st);
      }
      if (!nonEmpty(c.evidence)) v.push(`${at}: evidence must be a non-empty string`);
      if (st === "deferred" && !nonEmpty(c.needs)) v.push(`${at}: a deferred target needs a non-empty "needs"`);
      if ((st === "holds" || st === "broken") && c.needs !== void 0) v.push(`${at}: needs is only allowed when the status is deferred`);
    });
    for (const id of targetIds) if (!seen.has(id)) v.push(`target ${id} has no entry in checks`);
  }
  if (!Array.isArray(j.findings)) v.push("findings must be a list (use [] when there are none)");
  else {
    j.findings.forEach((f, i) => {
      const at = `findings[${i}]`;
      if (!isObj(f)) {
        v.push(`${at} must be an object`);
        return;
      }
      for (const k of Object.keys(f)) if (!FINDING_KEYS.includes(k)) v.push(`${at}: unknown key "${k}"`);
      const sev = f.severity;
      if (!isSeverity(sev)) v.push(`${at}: severity must be one of ${SEVERITIES.join(", ")}`);
      else severities.push(sev);
      if (!nonEmpty(f.claim)) v.push(`${at}: claim must be a non-empty string`);
      if (!nonEmpty(f.evidence)) v.push(`${at}: evidence must be a non-empty string`);
      if (f.suggestion !== void 0 && typeof f.suggestion !== "string") v.push(`${at}: suggestion must be a string`);
      let linked = false;
      if (f.check !== void 0) {
        if (targets === void 0) v.push(`${at}: check is only allowed when a targets file is given`);
        else if (typeof f.check !== "string" || !targetIds.includes(f.check)) v.push(`${at}: check "${String(f.check)}" is not a target`);
        else {
          linked = true;
          linkedChecks.add(f.check);
          const st = status.get(f.check);
          if (st !== void 0 && st !== "broken") v.push(`${at}: check ${f.check} is not broken (its status is ${st})`);
        }
      }
      if (f.unit === "outside-scope") {
        if (!linked && sev !== "critical") v.push(`${at}: outside-scope findings must be critical`);
        return;
      }
      if (f.unit === void 0) {
        v.push(`${at}: unit is required`);
        return;
      }
      const u = typeof f.unit === "string" ? active.get(f.unit) : void 0;
      if (!u) {
        v.push(`${at}: unit "${String(f.unit)}" is not one of this persona's concerns`);
        return;
      }
      flagged.add(u.canonical);
      if (linked) return;
      const threshold = effectiveThreshold(u);
      if (isSeverity(sev) && severityRank(sev) < severityRank(threshold)) {
        v.push(`${at}: severity ${sev} is below the ${threshold} threshold of ${u.canonical}`);
      }
    });
  }
  if (targets !== void 0 && Array.isArray(j.checks)) {
    j.checks.forEach((c, i) => {
      if (isObj(c) && c.status === "broken" && typeof c.id === "string" && targetIds.includes(c.id) && !linkedChecks.has(c.id)) {
        v.push(`checks[${i}]: broken target ${c.id} needs a finding with "check": "${c.id}"`);
      }
    });
  }
  const primary = p.units.primary.map((u) => u.canonical);
  const count = new Map(primary.map((id) => [id, flagged.has(id) ? 1 : 0]));
  if (!Array.isArray(j.cleared)) v.push("cleared must be a list (use [] when empty)");
  else {
    j.cleared.forEach((c, i) => {
      if (typeof c !== "string" || !primary.includes(c)) v.push(`cleared[${i}]: "${String(c)}" is not a primary concern`);
      else count.set(c, count.get(c) + 1);
    });
  }
  if (!Array.isArray(j.not_applicable)) v.push("not_applicable must be a list (use [] when empty)");
  else {
    j.not_applicable.forEach((n, i) => {
      const at = `not_applicable[${i}]`;
      if (!isObj(n)) {
        v.push(`${at} must be an object`);
        return;
      }
      for (const k of Object.keys(n)) if (k !== "unit" && k !== "reason") v.push(`${at}: unknown key "${k}"`);
      if (typeof n.unit === "string" && primary.includes(n.unit)) count.set(n.unit, count.get(n.unit) + 1);
      else v.push(`${at}: unit "${String(n.unit)}" is not a primary concern`);
      if (!nonEmpty(n.reason)) v.push(`${at}: reason must be a non-empty string`);
    });
  }
  for (const id of primary) {
    const n = count.get(id);
    if (n === 0) v.push(`primary concern ${id} must appear in findings, cleared, or not_applicable`);
    else if (n > 1) v.push(`primary concern ${id} must appear in exactly one of findings, cleared, not_applicable`);
  }
  if (verdict === "stop" && !severities.some((s) => s === "high" || s === "critical")) v.push("a stop verdict needs at least one high or critical finding");
  if (verdict === "proceed" && severities.includes("critical")) v.push("proceed is not allowed while a critical finding stands");
  if (verdict === "proceed" && [...status.values()].includes("broken")) v.push("proceed is not allowed while a target is broken");
  const names = p.judgmentSections.map((s) => s.name);
  if (j.sections === void 0) {
    if (names.length > 0) v.push(`sections must have keys: ${names.join(", ")}`);
  } else if (!isObj(j.sections)) {
    v.push("sections must be an object");
  } else {
    const sections = j.sections;
    for (const n of names) if (!nonEmpty(sections[n])) v.push(`sections["${n}"] must be a non-empty string`);
    for (const k of Object.keys(sections)) if (!names.includes(k)) v.push(`sections has unknown key "${k}"`);
  }
  if (j.investigate !== void 0) {
    if (!Array.isArray(j.investigate)) v.push("investigate must be a list");
    else {
      j.investigate.forEach((it, i) => {
        const at = `investigate[${i}]`;
        if (!isObj(it)) {
          v.push(`${at} must be an object`);
          return;
        }
        for (const k of Object.keys(it)) if (k !== "what" && k !== "why" && k !== "tools") v.push(`${at}: unknown key "${k}"`);
        if (!nonEmpty(it.what)) v.push(`${at}: what must be a non-empty string`);
        if (!nonEmpty(it.why)) v.push(`${at}: why must be a non-empty string`);
        if (!(Array.isArray(it.tools) && it.tools.length > 0 && it.tools.every(nonEmpty))) {
          v.push(`${at}: tools must be a non-empty list of tool names`);
        }
      });
    }
  }
  return v;
}

// src/render/prompt.ts
var bullets = (items) => items.map((i) => `- ${i}`).join("\n");
var code = (s) => `\`${s}\``;
var oneLine = (s) => s.replace(/\s+/g, " ").trim();
function primaryBlock(u, n) {
  const lines = [`### ${n}. ${u.canonical}`, "", u.unit.description, ""];
  if (u.unit.appliesWhen) lines.push(`- Applies when: ${u.unit.appliesWhen}`);
  lines.push(`- Threshold: ${effectiveThreshold(u)}`, "", "**Looks for**", "", u.unit.looksFor, "");
  const questions = [...u.unit.questions, ...u.addQuestions];
  const redFlags = [...u.unit.redFlags, ...u.addRedFlags];
  if (questions.length > 0) lines.push("**Questions**", "", bullets(questions), "");
  if (redFlags.length > 0) lines.push("**Red flags**", "", bullets(redFlags), "");
  lines.push("**Good looks like**", "", u.unit.goodLooksLike);
  return lines.join("\n");
}
function judgmentExample(p, targets) {
  const first = targets?.[0]?.id;
  const finding = {
    unit: p.units.primary[0]?.canonical ?? "concern-id",
    severity: "low | medium | high | critical",
    claim: "...",
    evidence: "...",
    suggestion: "..."
  };
  if (first !== void 0) finding.check = first;
  const example = {
    persona: p.canonical,
    verdict: "proceed | proceed-with-conditions | stop | insufficient-information",
    conditions: ["..."],
    missing: ["..."],
    findings: [finding],
    cleared: ["concern-id"],
    not_applicable: [{ unit: "concern-id", reason: "..." }],
    sections: Object.fromEntries(p.judgmentSections.map((s) => [s.name, "..."])),
    investigate: [{ what: "...", why: "...", tools: ["..."] }]
  };
  if (first !== void 0) example.checks = [{ id: first, status: "holds | broken | deferred", evidence: "...", needs: "..." }];
  return example;
}
var TARGET_RULES = [
  "Every target appears in `checks` exactly once, by its id, with a `status`: `holds` (you checked and it holds), `broken` (it does not hold), or `deferred` (it cannot be checked here). Every entry has `evidence`: what you ran or read, and what you saw.",
  '`broken` needs at least one finding with `"check": "<id>"`. A finding tied to a target may name any of your concerns, or `outside-scope`, at any severity; the threshold and critical-only rules do not apply to it.',
  "`deferred` needs `needs`: what it would take to check it (for example a device, production data, or a person). `holds` and `broken` have no `needs`.",
  "Only a finding tied to a `broken` target has `check`. If any target is `broken`, the verdict cannot be `proceed`."
];
function judgmentContract(p, mode, targets) {
  const ids = (us) => us.map((u) => code(u.canonical)).join(", ");
  const active = [...p.units.primary, ...p.units.secondary, ...p.units.deprioritized];
  const rules = [
    "The verdict is one of: `proceed`, `proceed-with-conditions`, `stop`, `insufficient-information`.",
    "`proceed-with-conditions` lists at least one condition. `insufficient-information` lists what is missing. `stop` needs at least one `high` or `critical` finding. Never `proceed` while a `critical` finding stands.",
    `Each finding names one concern by id (${ids(active)}) or \`outside-scope\`, a severity (\`low\`, \`medium\`, \`high\`, \`critical\`) at or above that concern's threshold, a claim, evidence, and optionally a suggestion.`,
    "`outside-scope` findings, and findings for deprioritized concerns, are allowed only at `critical`.",
    `Every primary concern (${ids(p.units.primary)}) appears exactly once across: findings, cleared (checked, nothing to raise), or not applicable (with a one-line reason that cites its "applies when" if it has one). Secondary and deprioritized concerns appear only if they raised a finding.`,
    "If something can only be checked with tools you do not have (running code, querying a system, opening the interface), do not guess: list it under `investigate` with what to check, why it matters, and the tools needed. `investigate` is optional."
  ];
  const intro = mode === "swap" ? "When you are asked for an assessment, give a judgment that follows these rules:" : "You are on a review panel. Give a judgment that follows these rules:";
  const parts = ["## Giving a judgment", intro, bullets(rules)];
  const sectionList = bullets(p.judgmentSections.map((s) => `${s.name}: ${s.ask}`));
  if (mode === "swap") {
    const headings2 = ["Verdict", "Conditions or Missing (when the verdict needs one)", "Findings", "Cleared", "Not applicable", ...p.judgmentSections.map((s) => s.name)];
    parts.push(`Format it in markdown with these headings, in order: ${headings2.join("; ")}. Write each finding as: \`- [severity] concern-id: claim \u2014 evidence\`.`);
    if (p.judgmentSections.length > 0) parts.push(`Also include:

${sectionList}`);
  } else {
    if (targets !== void 0 && targets.length > 0) {
      parts.push([
        "### Review targets",
        "Answer each of these in `checks`:",
        bullets(targets.map((t) => `${t.id}: ${oneLine(t.text)}`)),
        bullets(TARGET_RULES)
      ].join("\n\n"));
    }
    parts.push("Respond with only a JSON object (no prose, no code fence) of this shape:");
    parts.push(`\`\`\`json
${JSON.stringify(judgmentExample(p, targets), null, 2)}
\`\`\``);
    parts.push(`Include \`conditions\` only for \`proceed-with-conditions\` and \`missing\` only for \`insufficient-information\`. \`suggestion\` and \`investigate\` are optional.${targets !== void 0 && targets.length > 0 ? " Include `needs` only for `deferred` targets, and `check` only on findings tied to a `broken` target." : ""}`);
    parts.push(p.judgmentSections.length > 0 ? `\`sections\` has exactly these keys:

${sectionList}` : "Leave `sections` as `{}`: this persona defines no sections.");
  }
  return parts.join("\n\n");
}
function renderPrompt(p, mode, targets) {
  const out = [`# Persona: ${p.name}`, p.description, `## Stance

${p.stance.text}`];
  for (const s of p.extraSections) out.push(`## ${s.heading}

${s.text}`);
  out.push([
    "## Primary concerns",
    "These are your most important concerns, in priority order. Raise a finding for a concern only at or above its threshold.",
    ...p.units.primary.map((u, i) => primaryBlock(u, i + 1))
  ].join("\n\n"));
  if (p.units.secondary.length > 0) {
    out.push([
      "## Secondary concerns",
      "Glance at these. Raise a finding only at or above the stated threshold.",
      bullets(p.units.secondary.map((u) => `${u.canonical} (threshold ${effectiveThreshold(u)}): ${oneLine(u.unit.description)}`))
    ].join("\n\n"));
  }
  if (p.units.deprioritized.length > 0) {
    out.push([
      "## Deprioritized",
      bullets(p.units.deprioritized.map((u) => `${code(u.canonical)}: Resist raising concerns about: ${oneLine(u.unit.description)} unless critical.${u.note ? ` ${oneLine(u.note)}` : ""}`))
    ].join("\n\n"));
  }
  out.push(`## Tie-breaking

${p.tieBreaking.text}`);
  if (p.capabilities.length > 0) {
    out.push([
      "## Capabilities",
      bullets(p.capabilities.map((c) => `If the ${c.kind === "skills" ? "skill" : "MCP server"} ${code(c.name)} is available, use it when ${c.when}; if it isn't, say so rather than guessing.`))
    ].join("\n\n"));
  }
  out.push(judgmentContract(p, mode, mode === "panel" ? targets : void 0));
  return `${out.join("\n\n")}
`;
}

// src/parse/fields.ts
import { basename } from "node:path";
var KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var REF = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*:)?[a-z0-9]+(?:-[a-z0-9]+)*$/;
var isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function hint(value, options) {
  const s = didYouMean(value, options);
  return s ? `Did you mean "${s}"?` : void 0;
}
function stringField(fm, key, file, ds, required) {
  const v = fm.data[key];
  if (v === void 0 || v === null) {
    if (required) ds.push(err("E_REQUIRED", `missing required field "${key}"`, { file, line: 2 }, `Add "${key}: ..." to the frontmatter`));
    return void 0;
  }
  if (typeof v !== "string" || v.trim() === "") {
    ds.push(err("E_FIELD_TYPE", `"${key}" must be a non-empty string`, { file, line: fm.lineOf([key]) }, `Set "${key}" to a non-empty string`));
    return void 0;
  }
  return v.trim();
}
function checkName(name, file, fm, ds) {
  if (name === void 0) return;
  const line = fm.lineOf(["name"]);
  if (!KEBAB.test(name)) {
    ds.push(err("E_FIELD_TYPE", `name "${name}" must be kebab-case (a-z, 0-9, -)`, { file, line }, "Use only lowercase letters, digits and hyphens"));
    return;
  }
  const file0 = basename(file);
  const typed = /^(.*)\.(persona|unit|panel)\.md$/.exec(file0);
  const suffix = typed ? `.${typed[2]}.md` : ".md";
  const expected = typed ? typed[1] : basename(file, ".md");
  if (name !== expected) {
    const fix = KEBAB.test(expected) ? `Rename the file to ${name}${suffix}, or set name: ${expected}` : `Rename the file to ${name}${suffix}`;
    ds.push(err("E_NAME_MISMATCH", `name "${name}" does not match the filename "${expected}${suffix}"`, { file, line }, fix));
  }
}
function severityValue(v, what, file, line, ds) {
  if (typeof v === "string" && SEVERITIES.includes(v)) return v;
  const fallback = `Use one of ${SEVERITIES.join(", ")}`;
  ds.push(err("E_SEVERITY", `${what} must be one of ${SEVERITIES.join(", ")}`, { file, line }, typeof v === "string" && hint(v, SEVERITIES) || fallback));
  return void 0;
}
function stringList(v) {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && x.trim() !== "")) return void 0;
  return v.map((x) => x.trim());
}
function modelField(fm, file, ds) {
  const v = fm.data.model;
  if (v === void 0 || v === null) return void 0;
  const at = { file, line: fm.lineOf(["model"]) };
  const allowed = `one of ${PANEL_MODELS.join(", ")}`;
  if (typeof v !== "string") {
    ds.push(err("E_FIELD_TYPE", `"model" must be ${allowed}`, at, `Set "model" to ${allowed}`));
    return void 0;
  }
  if (!isPanelModel(v)) {
    ds.push(err("E_PERSONA_MODEL", `unknown model "${v}"`, at, hint(v, PANEL_MODELS) ?? `Use ${allowed}`));
    return void 0;
  }
  return v;
}
function warnUnknownFields(fm, known, file, ds) {
  for (const k of Object.keys(fm.data)) {
    if (!known.includes(k)) ds.push(warn("W_UNKNOWN_FIELD", `unknown field "${k}" is ignored`, { file, line: fm.lineOf([k]) }, hint(k, known) ?? `Remove "${k}", or check for a typo`));
  }
}

// src/parse/frontmatter.ts
var import_yaml = __toESM(require_dist(), 1);
function normalizeSource(src) {
  return src.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}
function splitFrontmatter(file, raw) {
  const lines = normalizeSource(raw).split("\n");
  const fail2 = (message, line, fix) => ({
    diagnostics: [err("E_FRONTMATTER", message, { file, line }, fix)]
  });
  if (lines[0]?.trim() !== "---") {
    return fail2("file must start with a --- frontmatter block", 1, "Add a frontmatter block delimited by --- lines at the top of the file");
  }
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (close < 0) return fail2("frontmatter block is not closed", 1, "Add a closing --- line after the frontmatter");
  const lineCounter = new import_yaml.LineCounter();
  const doc = (0, import_yaml.parseDocument)(lines.slice(1, close).join("\n"), { lineCounter });
  if (doc.errors.length > 0) {
    const e = doc.errors[0];
    const line = (e.linePos?.[0]?.line ?? 1) + 1;
    return fail2(`invalid YAML: ${e.message.split("\n")[0]}`, line, "Fix the YAML syntax in the frontmatter");
  }
  if (!(0, import_yaml.isMap)(doc.contents)) {
    return fail2("frontmatter must be a YAML mapping of fields", 2, "Write the frontmatter as key: value lines");
  }
  const lineOf = (path) => {
    for (let p = [...path]; p.length > 0; p = p.slice(0, -1)) {
      const last = p[p.length - 1];
      if (typeof last === "string") {
        const parent = p.length > 1 ? doc.getIn(p.slice(0, -1), true) : doc.contents;
        if ((0, import_yaml.isMap)(parent)) {
          const pair = parent.items.find((it) => (0, import_yaml.isScalar)(it.key) && it.key.value === last);
          const range = pair?.key?.range;
          if (range) return lineCounter.linePos(range[0]).line + 1;
        }
      }
      const node = doc.getIn(p, true);
      if (node && typeof node === "object" && node.range) return lineCounter.linePos(node.range[0]).line + 1;
    }
    return 2;
  };
  let data;
  try {
    data = doc.toJS();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail2(`invalid YAML: ${message}`, 2, "Fix the YAML syntax in the frontmatter");
  }
  return {
    fm: {
      data,
      lineOf,
      body: lines.slice(close + 1).join("\n"),
      bodyStartLine: close + 2
    },
    diagnostics: []
  };
}

// src/parse/sections.ts
var sectionKey = (heading) => heading.trim().replace(/\s+/g, " ").toLowerCase();
var HEADING3 = /^ {0,3}##(?!#)\s+(.+?)(?:\s+#+)?\s*$/;
var OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
var CLOSE_FENCE = /^ {0,3}(`{3,}|~{3,})\s*$/;
function finish(c) {
  let start = 0;
  let end = c.lines.length;
  while (start < end && c.lines[start].trim() === "") start++;
  while (end > start && c.lines[end - 1].trim() === "") end--;
  return {
    heading: c.heading,
    key: sectionKey(c.heading),
    text: c.lines.slice(start, end).join("\n"),
    line: c.line,
    textLine: c.line + 1 + start
  };
}
function splitSections(body, bodyStartLine) {
  const sections = [];
  const pre = [];
  let preLine = -1;
  let current;
  let fence;
  const absorb = (line, fileLine) => {
    if (current) current.lines.push(line);
    else if (line.trim() !== "") {
      if (preLine < 0) preLine = fileLine;
      pre.push(line);
    }
  };
  body.split("\n").forEach((line, i) => {
    const fileLine = bodyStartLine + i;
    if (fence) {
      const close = CLOSE_FENCE.exec(line);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) fence = void 0;
      absorb(line, fileLine);
      return;
    }
    const open = OPEN_FENCE.exec(line);
    if (open && !(open[1].startsWith("`") && open[2].includes("`"))) {
      fence = { char: open[1][0], len: open[1].length, line: fileLine };
      absorb(line, fileLine);
      return;
    }
    const h = HEADING3.exec(line);
    if (h) {
      if (current) sections.push(finish(current));
      current = { heading: h[1], line: fileLine, lines: [] };
      return;
    }
    absorb(line, fileLine);
  });
  if (current) sections.push(finish(current));
  return {
    preamble: pre.length > 0 ? { text: pre.join("\n"), line: preLine } : void 0,
    sections,
    unclosedFence: fence ? { line: fence.line } : void 0
  };
}
function parseList(text, startLine) {
  const items = [];
  let badLine;
  let badEmpty = false;
  text.split("\n").forEach((line, i) => {
    if (line.trim() === "") return;
    const bullet = /^\s{0,3}[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      items.push(bullet[1].trim());
      return;
    }
    if (/^\s{0,3}[-*+]\s*$/.test(line)) {
      if (badLine === void 0) {
        badLine = startLine + i;
        badEmpty = true;
      }
      return;
    }
    if (/^\s+\S/.test(line) && items.length > 0) {
      items[items.length - 1] += ` ${line.trim()}`;
      return;
    }
    if (badLine === void 0) badLine = startLine + i;
  });
  return badLine === void 0 ? { items } : { items, badLine, ...badEmpty ? { badEmpty } : {} };
}

// src/parse/persona.ts
var PERSONA_FIELDS = ["name", "description", "extends", "model", "units", "judgment", "capabilities", "overrides"];
var UNIT_KEYS = ["primary", "secondary", "deprioritized", "exclude", "primary_order"];
var ALL_SETTINGS = ["threshold", "add_questions", "add_red_flags", "note"];
var TIER_SETTINGS = {
  primary: ["threshold", "add_questions", "add_red_flags"],
  secondary: ["threshold"],
  deprioritized: ["note"],
  exclude: []
};
var CORE_JUDGMENT_HEADINGS = ["verdict", "conditions", "missing", "findings", "cleared", "not applicable"];
function parseEntry(item, tier, file, path, loc, ds) {
  const at = loc(path);
  if (typeof item === "string") {
    if (!REF.test(item)) {
      ds.push(err("E_FIELD_TYPE", `"${item}" is not a valid unit reference`, at, "Use a kebab-case name, or plugin:name"));
      return void 0;
    }
    return { ref: item, tier, loc: at };
  }
  if (!isPlainObject(item) || Object.keys(item).length !== 1) {
    ds.push(err("E_FIELD_TYPE", 'a unit entry must be a name, or a single "name: {settings}" mapping', at, 'Use a unit name, or a single "name: {settings}" mapping'));
    return void 0;
  }
  const [ref, settings] = Object.entries(item)[0];
  if (!REF.test(ref)) {
    ds.push(err("E_FIELD_TYPE", `"${ref}" is not a valid unit reference`, at, "Use a kebab-case name, or plugin:name"));
    return void 0;
  }
  const entry = { ref, tier, loc: at };
  if (settings === null || settings === void 0) return entry;
  if (!isPlainObject(settings)) {
    ds.push(err("E_FIELD_TYPE", `settings for ${ref} must be a mapping`, at, `Write settings for ${ref} as "key: value" pairs`));
    return void 0;
  }
  for (const [k, v] of Object.entries(settings)) {
    const settingAt = loc([...path, ref, k]);
    if (!ALL_SETTINGS.includes(k)) {
      ds.push(err("E_SETTING_UNKNOWN", `unknown setting "${k}" on ${ref}`, settingAt, hint(k, ALL_SETTINGS) ?? `Remove "${k}", or use one of ${ALL_SETTINGS.join(", ")}`));
      continue;
    }
    if (!TIER_SETTINGS[tier].includes(k)) {
      ds.push(err(
        "E_SETTING_TIER",
        `"${k}" is not allowed in ${tier}; ${tier} allows ${TIER_SETTINGS[tier].join(", ") || "no settings"}`,
        settingAt,
        `Remove "${k}", or move ${ref} to a tier that allows it`
      ));
      continue;
    }
    if (k === "threshold") {
      entry.threshold = severityValue(v, `threshold for ${ref}`, file, settingAt.line, ds);
    } else if (k === "note") {
      if (typeof v === "string" && v.trim() !== "") entry.note = v.trim();
      else ds.push(err("E_FIELD_TYPE", `note for ${ref} must be a non-empty string`, settingAt, `Set note to a non-empty string`));
    } else {
      const list3 = stringList(v);
      if (!list3) ds.push(err("E_FIELD_TYPE", `${k} for ${ref} must be a list of strings`, settingAt, `Set ${k} to a list of strings`));
      else if (k === "add_questions") entry.addQuestions = list3;
      else entry.addRedFlags = list3;
    }
  }
  return entry;
}
function parsePersona(file, raw) {
  const split = splitFrontmatter(file, raw);
  if (!split.fm) return { diagnostics: split.diagnostics };
  const fm = split.fm;
  const ds = [];
  const loc = (path) => ({ file, line: fm.lineOf(path) });
  warnUnknownFields(fm, PERSONA_FIELDS, file, ds);
  const name = stringField(fm, "name", file, ds, true);
  checkName(name, file, fm, ds);
  const descriptionHadTypeError = fm.data.description !== void 0 && fm.data.description !== null && typeof fm.data.description !== "string";
  const description = stringField(fm, "description", file, ds, false);
  const ext = stringField(fm, "extends", file, ds, false);
  const isChild = fm.data.extends !== void 0 && fm.data.extends !== null;
  if (ext !== void 0 && !REF.test(ext)) {
    ds.push(err("E_FIELD_TYPE", `extends "${ext}" is not a valid persona reference`, loc(["extends"]), "Use a kebab-case name, or plugin:name"));
  }
  const model = modelField(fm, file, ds);
  const units = [];
  let primaryOrder;
  let primaryTypeError = false;
  const u = fm.data.units;
  if (u !== void 0 && u !== null) {
    if (!isPlainObject(u)) ds.push(err("E_FIELD_TYPE", "units must be a mapping of tiers", loc(["units"]), `Write units as a mapping of ${UNIT_KEYS.join(", ")}`));
    else {
      for (const key of Object.keys(u)) {
        if (!UNIT_KEYS.includes(key)) {
          ds.push(err("E_FIELD_UNKNOWN", `unknown key units.${key}`, loc(["units", key]), hint(key, UNIT_KEYS) ?? `Use one of ${UNIT_KEYS.join(", ")}`));
          continue;
        }
        const list3 = u[key];
        if (list3 === null || list3 === void 0) continue;
        if (!Array.isArray(list3)) {
          ds.push(err("E_FIELD_TYPE", `units.${key} must be a list`, loc(["units", key]), `Write units.${key} as a YAML list`));
          if (key === "primary") primaryTypeError = true;
          continue;
        }
        if (key === "primary_order") {
          const refs = [];
          list3.forEach((r, i) => {
            if (typeof r !== "string" || !REF.test(r)) {
              ds.push(err("E_PRIMARY_ORDER", `primary_order entries must be unit references`, loc(["units", key, i]), "Use kebab-case unit references, or plugin:name"));
            } else if (refs.includes(r)) {
              ds.push(err("E_PRIMARY_ORDER", `${r} is listed twice in primary_order`, loc(["units", key, i]), "Remove the duplicate entry"));
            } else refs.push(r);
          });
          primaryOrder = { refs, loc: loc(["units", key]) };
          continue;
        }
        list3.forEach((item, i) => {
          const entry = parseEntry(item, key, file, ["units", key, i], loc, ds);
          if (entry) units.push(entry);
        });
      }
    }
  }
  const seen = /* @__PURE__ */ new Map();
  for (const e of units) {
    const prev = seen.get(e.ref);
    if (prev) {
      const message = prev.tier === e.tier ? `${e.ref} is listed twice in ${e.tier}` : `${e.ref} appears in both ${prev.tier} and ${e.tier}`;
      ds.push(err("E_DUPLICATE_UNIT", message, e.loc, "Keep it in one tier only"));
    } else seen.set(e.ref, e);
  }
  const judgmentSections = [];
  const j = fm.data.judgment;
  if (j !== void 0 && j !== null) {
    if (!isPlainObject(j)) ds.push(err("E_FIELD_TYPE", "judgment must be a mapping", loc(["judgment"]), "Write judgment as a mapping with a sections list"));
    else {
      for (const k of Object.keys(j)) {
        if (k !== "sections") ds.push(err("E_FIELD_UNKNOWN", `unknown key judgment.${k}`, loc(["judgment", k]), "Use judgment.sections"));
      }
      const secs = j.sections;
      if (secs !== void 0 && secs !== null) {
        if (!Array.isArray(secs)) ds.push(err("E_FIELD_TYPE", "judgment.sections must be a list", loc(["judgment", "sections"]), "Write judgment.sections as a YAML list"));
        else {
          secs.forEach((s, i) => {
            const at = loc(["judgment", "sections", i]);
            if (!isPlainObject(s) || typeof s.name !== "string" || !s.name.trim() || typeof s.ask !== "string" || !s.ask.trim()) {
              ds.push(err("E_FIELD_TYPE", "each judgment section needs a non-empty name and ask", at, "Give the section a non-empty name and ask"));
              return;
            }
            const extra = Object.keys(s).filter((x) => x !== "name" && x !== "ask");
            if (extra.length > 0) {
              ds.push(err(
                "E_FIELD_UNKNOWN",
                `unknown key ${extra.join(", ")} on judgment section ${s.name}`,
                loc(["judgment", "sections", i, extra[0]]),
                "A judgment section has only name and ask"
              ));
              return;
            }
            const key = sectionKey(s.name);
            if (CORE_JUDGMENT_HEADINGS.includes(key)) {
              ds.push(err("E_JUDGMENT_SECTION", `"${s.name}" collides with a core judgment heading`, at, "Choose a different section name"));
            } else if (judgmentSections.some((x) => sectionKey(x.name) === key)) {
              ds.push(err("E_JUDGMENT_SECTION", `judgment section "${s.name}" is defined twice`, at, "Section names must be unique, ignoring case"));
            } else {
              judgmentSections.push({ name: s.name.trim(), ask: s.ask.trim(), loc: at });
            }
          });
        }
      }
    }
  }
  const capabilities = [];
  const tools = [];
  const c = fm.data.capabilities;
  if (c !== void 0 && c !== null) {
    if (!isPlainObject(c)) ds.push(err("E_FIELD_TYPE", "capabilities must be a mapping", loc(["capabilities"]), "Write capabilities as a mapping with skills, mcp and/or tools"));
    else {
      for (const [k, v] of Object.entries(c)) {
        if (k === "tools") {
          const list3 = stringList(v);
          if (!list3) ds.push(err("E_FIELD_TYPE", "capabilities.tools must be a list of tool names", loc(["capabilities", k]), "Write capabilities.tools as a list of tool names"));
          else tools.push(...list3);
          continue;
        }
        if (k !== "skills" && k !== "mcp") {
          ds.push(err("E_FIELD_UNKNOWN", `unknown key capabilities.${k}`, loc(["capabilities", k]), hint(k, ["skills", "mcp", "tools"]) ?? "Use one of skills, mcp, tools"));
          continue;
        }
        if (!Array.isArray(v)) {
          ds.push(err("E_FIELD_TYPE", `capabilities.${k} must be a list`, loc(["capabilities", k]), `Write capabilities.${k} as a YAML list`));
          continue;
        }
        v.forEach((d, i) => {
          const at = loc(["capabilities", k, i]);
          if (!isPlainObject(d) || typeof d.name !== "string" || !d.name.trim() || typeof d.when !== "string" || !d.when.trim()) {
            ds.push(err("E_FIELD_TYPE", `each ${k} capability needs a non-empty name and when`, at, "Give the capability a non-empty name and when"));
            return;
          }
          const extra = Object.keys(d).filter((x) => x !== "name" && x !== "when");
          if (extra.length > 0) {
            ds.push(err(
              "E_FIELD_UNKNOWN",
              `unknown key ${extra.join(", ")} on ${k} capability ${d.name}`,
              loc(["capabilities", k, i, extra[0]]),
              "A capability has only name and when"
            ));
            return;
          }
          const trimmedName = d.name.trim();
          if (capabilities.some((x) => x.kind === k && x.name === trimmedName)) {
            ds.push(err("E_DUPLICATE", `${k} capability ${trimmedName} is declared twice`, at, "Remove the duplicate declaration, or rename one of them"));
            return;
          }
          capabilities.push({ kind: k, name: trimmedName, when: d.when.trim(), loc: at });
        });
      }
    }
  }
  const overrides = [];
  const o = fm.data.overrides;
  if (o !== void 0 && o !== null) {
    if (!isPlainObject(o)) ds.push(err("E_FIELD_TYPE", "overrides must be a mapping of clash id to child or parent", loc(["overrides"]), 'Write overrides as a mapping of clash id to "child" or "parent"'));
    else {
      for (const [k, v] of Object.entries(o)) {
        const at = loc(["overrides", k]);
        if (v !== "child" && v !== "parent") ds.push(err("E_OVERRIDE_VALUE", `overrides.${k} must be "child" or "parent"`, at, 'Set it to "child" or "parent"'));
        else overrides.push({ key: k, value: v, loc: at });
      }
    }
  }
  if (!isChild) {
    const needs = (what, present, at) => {
      if (present) ds.push(err("E_NEEDS_EXTENDS", `${what} is only valid in a persona that extends another`, at, "Add extends: <parent>, or remove it"));
    };
    const hasUnitKey = (key) => isPlainObject(u) && Object.prototype.hasOwnProperty.call(u, key);
    needs("units.exclude", hasUnitKey("exclude"), loc(["units", "exclude"]));
    needs("units.primary_order", hasUnitKey("primary_order"), loc(["units", "primary_order"]));
    needs("overrides", o !== void 0 && o !== null, loc(["overrides"]));
  }
  const body = splitSections(fm.body, fm.bodyStartLine);
  if (body.unclosedFence) {
    ds.push(err(
      "E_FENCE_UNCLOSED",
      "a fenced code block is never closed",
      { file, line: body.unclosedFence.line },
      `Close the fence opened on line ${body.unclosedFence.line}`
    ));
  }
  if (body.preamble) {
    ds.push(err("E_PREAMBLE", "text before the first ## heading is not allowed", { file, line: body.preamble.line }, "Put it under a ## heading, or delete it"));
  }
  let stance;
  let tieBreaking;
  const extraSections = [];
  const keys = /* @__PURE__ */ new Set();
  const nearMissHeading = /* @__PURE__ */ new Map();
  for (const s of body.sections) {
    const sec = { heading: s.heading.trim(), key: s.key, text: s.text, loc: { file, line: s.line } };
    if (keys.has(s.key)) {
      ds.push(err("E_HEADING_DUPLICATE", `"## ${s.heading}" appears more than once`, sec.loc, "Merge the two sections"));
      continue;
    }
    keys.add(s.key);
    if (s.text === "") ds.push(err("E_SECTION_EMPTY", `"## ${s.heading}" is empty`, sec.loc, "Add text under the heading, or remove it"));
    if (s.key === "stance") stance = sec;
    else if (s.key === "tie-breaking") tieBreaking = sec;
    else {
      extraSections.push(sec);
      const near = didYouMean(s.key, ["stance", "tie-breaking"]);
      if (near) {
        if (!nearMissHeading.has(near)) nearMissHeading.set(near, s.heading);
        const canonicalHeading = near === "stance" ? "Stance" : "Tie-breaking";
        ds.push(warn(
          "W_SECTION_NEAR_MISS",
          `"## ${s.heading}" looks like it might be meant as "## ${canonicalHeading}"`,
          sec.loc,
          `Rename "## ${s.heading}" to "## ${canonicalHeading}" if that's what you meant`
        ));
      }
    }
  }
  if (!isChild) {
    const root = (ok, what, fix) => {
      if (!ok) ds.push(err("E_ROOT_REQUIRED", `a persona without extends needs ${what}`, { file, line: 1 }, fix));
    };
    root(description !== void 0 || descriptionHadTypeError, "a description", 'Add "description: ..." to the frontmatter');
    root(
      units.some((e) => e.tier === "primary") || primaryTypeError,
      "at least one primary unit",
      "Add a unit under units.primary"
    );
    root(
      stance !== void 0,
      'a "## Stance" section',
      nearMissHeading.has("stance") ? `Rename "## ${nearMissHeading.get("stance")}" to "## Stance"` : 'Add a "## Stance" section'
    );
    root(
      tieBreaking !== void 0,
      'a "## Tie-breaking" section',
      nearMissHeading.has("tie-breaking") ? `Rename "## ${nearMissHeading.get("tie-breaking")}" to "## Tie-breaking"` : 'Add a "## Tie-breaking" section'
    );
  }
  if (hasErrors(ds) || name === void 0) return { diagnostics: ds };
  return {
    persona: {
      name,
      description,
      extends: ext,
      extendsLoc: ext !== void 0 ? loc(["extends"]) : void 0,
      model,
      units,
      primaryOrder,
      judgmentSections,
      capabilities,
      tools,
      overrides,
      stance,
      tieBreaking,
      extraSections,
      loc: { file, line: 1 }
    },
    diagnostics: ds
  };
}

// src/parse/unit.ts
var HEADINGS = {
  "looks for": "Looks for",
  questions: "Questions",
  "red flags": "Red flags",
  "good looks like": "Good looks like"
};
var HEADING_KEYS = Object.keys(HEADINGS);
function parseUnit(file, raw) {
  const split = splitFrontmatter(file, raw);
  if (!split.fm) return { diagnostics: split.diagnostics };
  const fm = split.fm;
  const ds = [];
  warnUnknownFields(fm, ["name", "description", "applies_when", "threshold"], file, ds);
  const name = stringField(fm, "name", file, ds, true);
  checkName(name, file, fm, ds);
  if (name === "outside-scope") {
    ds.push(err("E_FIELD_TYPE", 'unit name "outside-scope" is reserved', { file, line: fm.lineOf(["name"]) }, "Rename the unit; outside-scope is reserved for judgments"));
  }
  const description = stringField(fm, "description", file, ds, true);
  const appliesWhen = stringField(fm, "applies_when", file, ds, false);
  let threshold;
  if (fm.data.threshold === void 0 || fm.data.threshold === null) {
    ds.push(err("E_REQUIRED", 'missing required field "threshold"', { file, line: 2 }, `Add "threshold: medium" (one of ${SEVERITIES.join(", ")})`));
  } else {
    threshold = severityValue(fm.data.threshold, "threshold", file, fm.lineOf(["threshold"]), ds);
  }
  const body = splitSections(fm.body, fm.bodyStartLine);
  if (body.unclosedFence) {
    ds.push(err(
      "E_FENCE_UNCLOSED",
      "a fenced code block is never closed",
      { file, line: body.unclosedFence.line },
      `Close the fence opened on line ${body.unclosedFence.line}`
    ));
  }
  if (body.preamble) {
    ds.push(err("E_PREAMBLE", "text before the first ## heading is not allowed", { file, line: body.preamble.line }, "Move it under one of the four headings, or delete it"));
  }
  const found = /* @__PURE__ */ new Map();
  const suggested = /* @__PURE__ */ new Set();
  for (const s of body.sections) {
    if (!HEADING_KEYS.includes(s.key)) {
      const sug = didYouMean(s.key, HEADING_KEYS);
      if (sug) suggested.add(sug);
      ds.push(err(
        "E_UNIT_HEADING_UNKNOWN",
        `unknown heading "## ${s.heading}"; a unit has exactly: Looks for, Questions, Red flags, Good looks like`,
        { file, line: s.line },
        sug ? `Did you mean "## ${HEADINGS[sug]}"?` : "Remove the heading, or move its text into one of the four sections"
      ));
      continue;
    }
    const key = s.key;
    if (found.has(key)) {
      ds.push(err("E_HEADING_DUPLICATE", `"## ${s.heading}" appears more than once`, { file, line: s.line }, "Merge the two sections"));
      continue;
    }
    found.set(key, s);
  }
  for (const key of HEADING_KEYS) {
    if (!found.has(key) && !suggested.has(key) && !body.unclosedFence) {
      ds.push(err("E_HEADING_MISSING", `missing required heading "## ${HEADINGS[key]}"`, { file, line: fm.bodyStartLine }, `Add a "## ${HEADINGS[key]}" section`));
    }
  }
  const prose = (key) => {
    const s = found.get(key);
    if (s && s.text === "") ds.push(err("E_SECTION_EMPTY", `"## ${s.heading}" is empty`, { file, line: s.line }, "Add text under the heading, or remove it"));
    return s?.text ?? "";
  };
  const list3 = (key) => {
    const s = found.get(key);
    if (!s) return [];
    if (s.text === "") {
      ds.push(err("E_SECTION_EMPTY", `"## ${s.heading}" is empty`, { file, line: s.line }, "Add at least one bullet item, or remove the heading"));
      return [];
    }
    const r = parseList(s.text, s.textLine);
    if (r.badLine !== void 0) {
      const fix = r.badEmpty ? 'That bullet has no text; add text after the "-", or remove it' : 'Start each item with "- "';
      ds.push(err("E_LIST_FORMAT", `"## ${s.heading}" must be a bullet list`, { file, line: r.badLine }, fix));
    }
    return r.items;
  };
  const looksFor = prose("looks for");
  const questions = list3("questions");
  const redFlags = list3("red flags");
  const goodLooksLike = prose("good looks like");
  if (hasErrors(ds) || !name || !description || !threshold) return { diagnostics: ds };
  return {
    unit: { name, description, appliesWhen, threshold, looksFor, questions, redFlags, goodLooksLike, loc: { file, line: 1 } },
    diagnostics: ds
  };
}

// src/resolve/format.ts
var import_yaml2 = __toESM(require_dist(), 1);
function quoteKey(id) {
  return (0, import_yaml2.stringify)(id, { lineWidth: 0 }).trim();
}
function overrideLine(id, value) {
  const key = quoteKey(id);
  return key.startsWith('"') ? `${key}: ${value}` : `"${key}: ${value}"`;
}

// src/resolve/merge.ts
var SETTINGS = ["threshold", "addQuestions", "addRedFlags", "note"];
var LEGAL = {
  primary: ["threshold", "addQuestions", "addRedFlags"],
  secondary: ["threshold"],
  deprioritized: ["note"]
};
var LABEL = { threshold: "threshold", addQuestions: "add_questions", addRedFlags: "add_red_flags", note: "note" };
function emptyAcc() {
  return { name: "", units: { primary: [], secondary: [], deprioritized: [] }, extraSections: [], judgmentSections: [], capabilities: [], tools: [] };
}
var cloneUnit = (u) => ({ ...u, addQuestions: [...u.addQuestions], addRedFlags: [...u.addRedFlags] });
function cloneAcc(a) {
  return {
    ...a,
    units: { primary: a.units.primary.map(cloneUnit), secondary: a.units.secondary.map(cloneUnit), deprioritized: a.units.deprioritized.map(cloneUnit) },
    extraSections: [...a.extraSections],
    judgmentSections: a.judgmentSections.map((s) => ({ ...s })),
    capabilities: a.capabilities.map((c) => ({ ...c })),
    tools: [...a.tools]
  };
}
var union = (a, b) => {
  const out = [...a];
  for (const x of b) if (!out.includes(x)) out.push(x);
  return out;
};
var excerpt = (text) => {
  const first = text.split("\n")[0].trim();
  return first.length > 60 ? `${first.slice(0, 57)}...` : first;
};
var settingsOf = (e) => SETTINGS.filter((s) => e[s] !== void 0);
function dropIllegal(u, tier) {
  const dropped = [];
  if (!LEGAL[tier].includes("threshold") && u.thresholdSet !== void 0) {
    dropped.push(`inherited threshold ${u.thresholdSet}`);
    u.thresholdSet = void 0;
  }
  if (!LEGAL[tier].includes("addQuestions") && u.addQuestions.length > 0) {
    dropped.push("inherited add_questions");
    u.addQuestions = [];
  }
  if (!LEGAL[tier].includes("addRedFlags") && u.addRedFlags.length > 0) {
    dropped.push("inherited add_red_flags");
    u.addRedFlags = [];
  }
  if (!LEGAL[tier].includes("note") && u.note !== void 0) {
    dropped.push("inherited note");
    u.note = void 0;
  }
  return dropped;
}
function applyLayer(a, layer) {
  const acc = cloneAcc(a);
  const clashes = [];
  const diagnostics = [];
  const consulted = /* @__PURE__ */ new Set();
  const clash = (id, child, parent, loc) => {
    const o = layer.overrides.get(id);
    if (o) consulted.add(id);
    const c = { id, layer: layer.file, child, parent, decision: o ? o.value : "unreviewed", dropped: [], loc };
    clashes.push(c);
    return c;
  };
  const find = (canonical) => {
    for (const tier of TIERS) {
      const index = acc.units[tier].findIndex((u) => u.canonical === canonical);
      if (index >= 0) return { tier, index, unit: acc.units[tier][index] };
    }
    return void 0;
  };
  const placed = { primary: [], secondary: [], deprioritized: [] };
  for (const e of layer.doc.units) {
    const r = layer.refs.get(e.ref);
    if (!r) continue;
    const existing = find(r.canonical);
    if (e.tier === "exclude") {
      if (!existing) {
        diagnostics.push(warn("W_EXCLUDE_NOOP", `exclude: ${e.ref} is not inherited, so excluding it does nothing`, e.loc, `Remove ${e.ref} from units.exclude`));
        continue;
      }
      const c = clash(`${r.canonical}.excluded`, "excluded", existing.tier, e.loc);
      if (c.decision !== "parent") acc.units[existing.tier].splice(existing.index, 1);
      continue;
    }
    if (!existing) {
      placed[e.tier].push({
        canonical: r.canonical,
        unit: r.unit,
        tier: e.tier,
        thresholdSet: e.threshold,
        addQuestions: [...e.addQuestions ?? []],
        addRedFlags: [...e.addRedFlags ?? []],
        note: e.note
      });
      continue;
    }
    let u = existing.unit;
    let target = existing.tier;
    let tierClash;
    if (existing.tier !== e.tier) {
      tierClash = clash(`${r.canonical}.tier`, e.tier, existing.tier, e.loc);
      if (tierClash.decision !== "parent") {
        target = e.tier;
        acc.units[existing.tier].splice(existing.index, 1);
        u = { ...u, tier: target };
        tierClash.dropped.push(...dropIllegal(u, target));
        placed[target].push(u);
      }
    }
    for (const s of settingsOf(e)) {
      if (!LEGAL[target].includes(s)) tierClash?.dropped.push(`${LABEL[s]} from ${layer.file.canonical}`);
    }
    if (e.threshold !== void 0 && LEGAL[target].includes("threshold")) {
      const current = effectiveThreshold(u);
      if (e.threshold !== current) {
        const c = clash(`${r.canonical}.threshold`, e.threshold, current, e.loc);
        if (c.decision !== "parent") u.thresholdSet = e.threshold;
      } else {
        u.thresholdSet = e.threshold;
      }
    }
    if (LEGAL[target].includes("addQuestions")) u.addQuestions = union(u.addQuestions, e.addQuestions ?? []);
    if (LEGAL[target].includes("addRedFlags")) u.addRedFlags = union(u.addRedFlags, e.addRedFlags ?? []);
    if (e.note !== void 0 && target === "deprioritized") {
      if (u.note !== void 0 && u.note !== e.note) {
        const c = clash(`${r.canonical}.note`, e.note, u.note, e.loc);
        if (c.decision !== "parent") u.note = e.note;
      } else {
        u.note = e.note;
      }
    }
  }
  acc.units.primary = [...placed.primary, ...acc.units.primary];
  acc.units.secondary = [...acc.units.secondary, ...placed.secondary];
  acc.units.deprioritized = [...acc.units.deprioritized, ...placed.deprioritized];
  const order2 = layer.doc.primaryOrder;
  if (order2) {
    const wanted = [];
    const refByCanonical = /* @__PURE__ */ new Map();
    for (const ref of order2.refs) {
      const canonical = layer.refs.get(ref)?.canonical;
      if (!canonical) continue;
      if (!acc.units.primary.some((u) => u.canonical === canonical)) {
        diagnostics.push(err("E_PRIMARY_ORDER", `primary_order lists ${ref}, which is not a primary unit of this persona`, order2.loc, "List only units that end up in primary"));
        continue;
      }
      const earlier = refByCanonical.get(canonical);
      if (earlier) {
        diagnostics.push(err("E_PRIMARY_ORDER", `${ref} is the same unit as ${earlier} (${canonical}); list it once`, order2.loc, `Remove ${ref} from primary_order and keep ${earlier}`));
        continue;
      }
      refByCanonical.set(canonical, ref);
      wanted.push(canonical);
    }
    const reordered = [
      ...wanted.map((c) => acc.units.primary.find((u) => u.canonical === c)),
      ...acc.units.primary.filter((u) => !wanted.includes(u.canonical))
    ];
    const inherited = new Set(a.units.primary.map((u) => u.canonical));
    const before = acc.units.primary.map((u) => u.canonical).filter((c) => inherited.has(c));
    const after = reordered.map((u) => u.canonical).filter((c) => inherited.has(c));
    if (before.join("\n") !== after.join("\n")) {
      const c = clash("primary-order", after.join(", "), before.join(", "), order2.loc);
      if (c.decision !== "parent") acc.units.primary = reordered;
    } else {
      acc.units.primary = reordered;
    }
  }
  const doc = layer.doc;
  const replaceText = (id, next, prev) => {
    if (!prev || prev.text === next.text) return next;
    const c = clash(id, excerpt(next.text), excerpt(prev.text), next.loc);
    return c.decision === "parent" ? prev : next;
  };
  if (doc.stance) acc.stance = replaceText("stance", doc.stance, acc.stance);
  if (doc.tieBreaking) acc.tieBreaking = replaceText("tie-breaking", doc.tieBreaking, acc.tieBreaking);
  for (const s of doc.extraSections) {
    const i = acc.extraSections.findIndex((x) => x.key === s.key);
    if (i < 0) acc.extraSections.push(s);
    else acc.extraSections[i] = replaceText(`section:${s.key}`, s, acc.extraSections[i]);
  }
  for (const j of doc.judgmentSections) {
    const key = sectionKey(j.name);
    const i = acc.judgmentSections.findIndex((x) => sectionKey(x.name) === key);
    if (i < 0) {
      acc.judgmentSections.push({ name: j.name, ask: j.ask });
      continue;
    }
    const prev = acc.judgmentSections[i];
    if (prev.ask === j.ask) continue;
    const c = clash(`judgment:${key}`, excerpt(j.ask), excerpt(prev.ask), j.loc);
    if (c.decision !== "parent") acc.judgmentSections[i] = { name: j.name, ask: j.ask };
  }
  for (const cap of doc.capabilities) {
    const i = acc.capabilities.findIndex((x) => x.kind === cap.kind && x.name === cap.name);
    if (i < 0) {
      acc.capabilities.push({ kind: cap.kind, name: cap.name, when: cap.when });
      continue;
    }
    const prev = acc.capabilities[i];
    if (prev.when === cap.when) continue;
    const c = clash(`capability:${cap.kind}:${cap.name}`, cap.when, prev.when, cap.loc);
    if (c.decision !== "parent") acc.capabilities[i] = { kind: cap.kind, name: cap.name, when: cap.when };
  }
  acc.tools = union(acc.tools, doc.tools);
  acc.name = doc.name;
  if (doc.description !== void 0) acc.description = doc.description;
  if (doc.model !== void 0) acc.model = doc.model;
  const stale = [...layer.overrides].filter(([id]) => !consulted.has(id)).map(([id, o]) => ({ layer: layer.file, key: o.key, id, loc: o.loc, hint: o.hint }));
  return { acc, clashes, stale, diagnostics };
}

// src/resolve/resolve.ts
var SECTION_OR_JUDGMENT_KEY = /^(section|judgment):(.*)$/;
var UNIT_FIELDS = ["tier", "threshold", "note", "excluded"];
function splitUnitKey(key) {
  if (/^(section|judgment|capability):/.test(key)) return void 0;
  const i = key.lastIndexOf(".");
  if (i <= 0) return void 0;
  const field = key.slice(i + 1);
  return UNIT_FIELDS.includes(field) ? { unitRef: key.slice(0, i), field } : void 0;
}
function resolvePersona(reg, ref) {
  const ds = [];
  const report2 = { clashes: [], stale: [], shadows: [] };
  const shadows = /* @__PURE__ */ new Map();
  const chain = [];
  const noteShadow = (s) => {
    if (s) shadows.set(`${s.kind}:${s.name}:${s.used.path}`, s);
  };
  const done = () => {
    const chainPaths = new Set(chain.map((c) => c.file.path));
    const visibleShadows = [...shadows.values()].map((s) => s.kind === "persona" ? { ...s, shadowed: s.shadowed.filter((f) => !chainPaths.has(f.path)) } : s).filter((s) => s.shadowed.length > 0);
    return { report: { ...report2, shadows: visibleShadows }, diagnostics: ds };
  };
  const top = reg.lookup("persona", ref);
  if (!top.file) {
    ds.push(top.diagnostic);
    return done();
  }
  noteShadow(top.shadow);
  const seen = /* @__PURE__ */ new Set();
  let current = top.file;
  while (current) {
    if (seen.has(current.path)) {
      const path = [...chain.map((c) => c.file.canonical), current.canonical].join(" \u2192 ");
      ds.push(err(
        "E_CYCLE",
        `extends cycle: ${path}`,
        { file: current.path, line: 1 },
        "Break the cycle. To extend a plugin persona that has the same name, use its namespaced form (plugin:name)"
      ));
      return done();
    }
    seen.add(current.path);
    const raw = readIfExists(current.path);
    if (raw === void 0) {
      ds.push(err("E_READ", `could not read ${current.path}`, { file: current.path, line: 1 }, "Check that the file still exists and is readable"));
      return done();
    }
    const parsed2 = parsePersona(current.path, raw);
    ds.push(...parsed2.diagnostics);
    if (!parsed2.persona) return done();
    chain.push({ file: current, doc: parsed2.persona });
    const ext = parsed2.persona.extends;
    if (ext === void 0) break;
    const at = parsed2.persona.extendsLoc;
    const next = ext === current.name && !ext.includes(":") ? reg.lookup("persona", ext, at, current.scope) : reg.lookup("persona", ext, at);
    if (!next.file) {
      ds.push(next.diagnostic);
      return done();
    }
    noteShadow(next.shadow);
    current = next.file;
  }
  const inputs = new Map(chain.map((c) => [c.file.path, c.file]));
  const unitCache = /* @__PURE__ */ new Map();
  const loadUnit = (f) => {
    if (!unitCache.has(f.path)) {
      const raw = readIfExists(f.path);
      if (raw === void 0) {
        ds.push(err("E_READ", `could not read ${f.path}`, { file: f.path, line: 1 }, "Check that the file still exists and is readable"));
        unitCache.set(f.path, null);
      } else {
        const p = parseUnit(f.path, raw);
        ds.push(...p.diagnostics);
        unitCache.set(f.path, p.unit ?? null);
      }
    }
    inputs.set(f.path, f);
    return unitCache.get(f.path) ?? void 0;
  };
  let acc = emptyAcc();
  for (const { file, doc } of [...chain].reverse()) {
    const refs = /* @__PURE__ */ new Map();
    const resolveRef = (unitRef, at) => {
      const known = refs.get(unitRef);
      if (known) return known;
      const l = reg.lookup("unit", unitRef, at);
      if (!l.file) {
        ds.push(l.diagnostic);
        return void 0;
      }
      noteShadow(l.shadow);
      const unit = loadUnit(l.file);
      if (!unit) return void 0;
      const r = { canonical: l.file.canonical, unit };
      refs.set(unitRef, r);
      return r;
    };
    const byCanonical = /* @__PURE__ */ new Map();
    const dedupedUnits = [];
    for (const e of doc.units) {
      const r = resolveRef(e.ref, e.loc);
      if (!r) continue;
      const prev = byCanonical.get(r.canonical);
      if (prev) {
        ds.push(err("E_DUPLICATE_UNIT", `${e.ref} and ${prev.ref} are the same unit (${r.canonical}); a unit may appear only once per file`, e.loc, "Keep one entry"));
      } else {
        byCanonical.set(r.canonical, e);
        dedupedUnits.push(e);
      }
    }
    for (const r of doc.primaryOrder?.refs ?? []) resolveRef(r, doc.primaryOrder.loc);
    const overrides = /* @__PURE__ */ new Map();
    for (const o of doc.overrides) {
      let id = o.key;
      let hint2;
      const split = splitUnitKey(o.key);
      if (split) {
        const l = reg.lookup("unit", split.unitRef, o.loc);
        if (l.file) {
          id = `${l.file.canonical}.${split.field}`;
          if (id !== o.key) ds.push(warn("W_OVERRIDE_KEY_NONCANONICAL", `overrides key "${o.key}" is better written "${id}"`, o.loc, `Rename the key to ${quoteKey(id)}`));
        } else {
          hint2 = l.diagnostic?.fix;
        }
      } else {
        const m = SECTION_OR_JUDGMENT_KEY.exec(o.key);
        if (m) {
          id = `${m[1]}:${sectionKey(m[2])}`;
          if (id !== o.key) ds.push(warn("W_OVERRIDE_KEY_NONCANONICAL", `overrides key "${o.key}" is better written "${id}"`, o.loc, `Rename the key to ${quoteKey(id)}`));
        }
      }
      const prev = overrides.get(id);
      if (prev) {
        ds.push(warn(
          "W_OVERRIDE_DUPLICATE",
          `overrides "${o.key}" duplicates "${prev.key}" (both resolve to "${id}"); the first entry wins`,
          o.loc,
          `Remove the duplicate "${o.key}" entry, or merge it into "${prev.key}"`
        ));
        continue;
      }
      overrides.set(id, hint2 ? { ...o, hint: hint2 } : o);
    }
    const res = applyLayer(acc, { file, doc: { ...doc, units: dedupedUnits }, refs, overrides });
    acc = res.acc;
    report2.clashes.push(...res.clashes);
    report2.stale.push(...res.stale);
    ds.push(...res.diagnostics);
  }
  for (const c of report2.clashes) {
    if (c.decision !== "unreviewed") continue;
    if (c.layer.scope.kind === "plugin") continue;
    ds.push(warn(
      "W_UNREVIEWED",
      `unreviewed clash ${c.id}: child ${c.child}, parent ${c.parent}`,
      c.loc,
      `Under overrides: in ${c.layer.path}, add ${overrideLine(c.id, "child")} to keep this, or ${overrideLine(c.id, "parent")} to flip it`
    ));
  }
  for (const s of report2.stale) {
    ds.push(warn(
      "W_STALE_OVERRIDE",
      `overrides entry "${s.key}" matches no clash in this persona`,
      s.loc,
      s.hint ? `Remove the entry, or fix the reference: ${s.hint}` : "Remove the entry"
    ));
  }
  if (acc.units.primary.length > 7) {
    ds.push(warn("W_TOO_MANY_PRIMARY", `${acc.units.primary.length} primary units; if everything is primary, nothing is`, { file: top.file.path, line: 1 }, "Move some units to secondary"));
  }
  const result = done();
  if (hasErrors(ds) || !acc.stance || !acc.tieBreaking || acc.description === void 0) return result;
  const sortedPaths = [...inputs.keys()].sort();
  return {
    ...result,
    effective: {
      name: acc.name,
      canonical: top.file.canonical,
      description: acc.description,
      model: acc.model ?? null,
      source: top.file.path,
      sourceId: inputId(top.file),
      units: acc.units,
      stance: acc.stance,
      tieBreaking: acc.tieBreaking,
      extraSections: acc.extraSections,
      judgmentSections: acc.judgmentSections,
      capabilities: acc.capabilities,
      tools: acc.tools,
      inputs: sortedPaths,
      inputIds: sortedPaths.map((path) => inputId(inputs.get(path))),
      inputScopes: [...new Set([...inputs.values()].map((f) => f.scope.kind))]
    }
  };
}

// src/cli/judgment.ts
function readInput(file, env) {
  if (file !== void 0) {
    try {
      return { text: readFileSync3(file, "utf8") };
    } catch {
      return { error: `could not read ${file}` };
    }
  }
  try {
    return { text: env.stdin?.() ?? "" };
  } catch (e) {
    const code2 = e.code;
    return { error: `could not read stdin${code2 ? ` (${code2})` : ""}` };
  }
}
function missingInputSource(file, env) {
  if (file === void 0 && env.stdinIsTTY === true) return "pass --file <path> or pipe the JSON on stdin";
  return void 0;
}
function loadTargets(path, env) {
  let text;
  try {
    text = readFileSync3(path, "utf8");
  } catch {
    env.out(`could not read ${path}`);
    return void 0;
  }
  const r = parseTargetsFile(text);
  if ("error" in r) {
    env.out(`${path}: ${r.error}`);
    return void 0;
  }
  return r.targets;
}
function personaAndTargets(reg, name, checks, env) {
  const r = resolvePersona(reg, name);
  if (!r.effective) {
    for (const d of r.diagnostics.filter((x) => x.level === "error")) env.out(formatDiagnostic(d));
    return { code: 1 };
  }
  if (checks === void 0) return { effective: r.effective };
  const targets = loadTargets(checks, env);
  return targets === void 0 ? { code: 2 } : { effective: r.effective, targets };
}
function readRequiredInput(file, env) {
  const hint2 = missingInputSource(file, env);
  if (hint2 !== void 0) {
    env.out(hint2);
    return { code: 2 };
  }
  const input = readInput(file, env);
  if (input.error) {
    env.out(input.error);
    return { code: 1 };
  }
  return { text: input.text ?? "" };
}
function reportValidity(violations, env) {
  env.out(JSON.stringify(violations.length === 0 ? { valid: true } : { valid: false, violations }, null, 2));
  return violations.length === 0 ? 0 : 1;
}
function promptCmd(reg, name, env, checks) {
  const p = personaAndTargets(reg, name, checks, env);
  if ("code" in p) return p.code;
  env.out(renderPrompt(p.effective, "panel", p.targets).replace(/\n$/, ""));
  return 0;
}
function checkJudgmentCmd(reg, name, file, env, checks) {
  const p = personaAndTargets(reg, name, checks, env);
  if ("code" in p) return p.code;
  const input = readRequiredInput(file, env);
  if ("code" in input) return input.code;
  const text = input.text.trim();
  if (text === "") return reportValidity(["no input"], env);
  let judgment;
  try {
    judgment = JSON.parse(text);
  } catch {
    return reportValidity(["not valid JSON"], env);
  }
  return reportValidity(validateJudgment(p.effective, judgment, p.targets), env);
}
function checkEvidenceCmd(file, env) {
  const input = readRequiredInput(file, env);
  if ("code" in input) return input.code;
  return reportValidity(validateEvidence(input.text), env);
}

// src/cli/list.ts
import { readFileSync as readFileSync5 } from "node:fs";

// src/panel/panels.ts
import { readFileSync as readFileSync4 } from "node:fs";

// src/parse/panel.ts
function parsePanel(file, raw) {
  const split = splitFrontmatter(file, raw);
  if (!split.fm) return { diagnostics: split.diagnostics };
  const fm = split.fm;
  const ds = [];
  warnUnknownFields(fm, ["name", "description", "personas", "models"], file, ds);
  const name = stringField(fm, "name", file, ds, true);
  checkName(name, file, fm, ds);
  const description = stringField(fm, "description", file, ds, true);
  const personas = [];
  const list3 = fm.data.personas;
  const at = (i) => ({ file, line: fm.lineOf(i === void 0 ? ["personas"] : ["personas", i]) });
  if (list3 === void 0 || list3 === null) {
    ds.push(err("E_REQUIRED", 'missing required field "personas"', { file, line: 2 }, 'Add "personas: [a, b]" listing 2 to 6 personas'));
  } else if (!Array.isArray(list3)) {
    ds.push(err("E_FIELD_TYPE", '"personas" must be a list of persona names', at(), "Write it as personas: [a, b]"));
  } else {
    list3.forEach((r, i) => {
      if (typeof r !== "string" || !REF.test(r)) {
        ds.push(err("E_FIELD_TYPE", `personas[${i}] is not a valid persona reference`, at(i), "Use a kebab-case name, or plugin:name"));
      } else if (personas.some((p) => p.ref === r)) {
        ds.push(err("E_PANEL_PERSONA", `${r} is listed twice`, at(i), "List each persona once"));
      } else {
        personas.push({ ref: r, loc: at(i) });
      }
    });
    if (list3.length < 2 || list3.length > 6) {
      ds.push(err("E_PANEL_SIZE", `a panel needs 2 to 6 personas, this one lists ${list3.length}`, at(), "List between 2 and 6 personas"));
    }
  }
  const models = {};
  const m = fm.data.models;
  if (m !== void 0 && m !== null) {
    if (typeof m !== "object" || Array.isArray(m)) {
      ds.push(err("E_FIELD_TYPE", '"models" must map persona names to a model', { file, line: fm.lineOf(["models"]) }, "Write it as models: { <persona>: sonnet }"));
    } else {
      for (const [ref, model] of Object.entries(m)) {
        const loc = { file, line: fm.lineOf(["models", ref]) };
        if (!personas.some((p) => p.ref === ref)) {
          ds.push(err("E_PANEL_MODEL", `models names "${ref}", which is not in personas`, loc, "Use a persona exactly as personas lists it"));
        } else if (!isPanelModel(model)) {
          const fix = typeof model === "string" && hint(model, PANEL_MODELS) || `Use one of ${PANEL_MODELS.join(", ")}`;
          ds.push(err("E_PANEL_MODEL", `models gives "${ref}" an unknown model ${JSON.stringify(model)}`, loc, fix));
        } else {
          models[ref] = model;
        }
      }
    }
  }
  if (hasErrors(ds) || !name || !description) return { diagnostics: ds };
  return { panel: { name, description, personas, models, notes: fm.body.trim(), loc: { file, line: 1 } }, diagnostics: ds };
}

// src/panel/panels.ts
function checkPanelFile(reg, f) {
  let raw;
  try {
    raw = readFileSync4(f.path, "utf8");
  } catch {
    return { personas: [], diagnostics: [err("E_READ", `could not read ${f.path}`, { file: f.path, line: 1 }, "Check that the file still exists and is readable")] };
  }
  const parsed2 = parsePanel(f.path, raw);
  if (!parsed2.panel) return { personas: [], diagnostics: parsed2.diagnostics };
  const ds = [...parsed2.diagnostics];
  const personas = [];
  const refByPath = /* @__PURE__ */ new Map();
  for (const p of parsed2.panel.personas) {
    const l = reg.lookup("persona", p.ref, p.loc);
    if (!l.file) {
      ds.push(err("E_PANEL_PERSONA", `panel persona "${p.ref}" does not resolve`, p.loc, l.diagnostic?.fix ?? "Use the name of an existing persona"));
      continue;
    }
    const dup = personas.find((x) => x.path === l.file.path);
    if (dup) {
      const earlierRef = refByPath.get(dup.path);
      ds.push(err("E_PANEL_PERSONA", `"${p.ref}" and "${earlierRef}" are the same persona (${l.file.canonical})`, p.loc, "List each persona once"));
      continue;
    }
    personas.push(l.file);
    refByPath.set(l.file.path, p.ref);
  }
  return { panel: parsed2.panel, personas, diagnostics: ds };
}

// src/scopes/registry.ts
import { readdirSync, statSync as statSync3 } from "node:fs";
import { join as join2 } from "node:path";
var RANK = { project: 0, user: 1, plugin: 2 };
var SUFFIX = { persona: ".persona.md", unit: ".unit.md", panel: ".panel.md" };
var KINDS = ["persona", "unit", "panel"];
var scopeRank = (kind) => RANK[kind];
function canonicalName(scope, name) {
  return scope.kind === "plugin" ? `${scope.plugin}:${name}` : name;
}
function isRegularFile(dir, e) {
  if (e.isFile()) return true;
  if (!e.isSymbolicLink()) return false;
  try {
    return statSync3(join2(dir, e.name)).isFile();
  } catch {
    return false;
  }
}
var Registry = class {
  constructor(scopes) {
    this.scopes = scopes;
    const seenRoots = /* @__PURE__ */ new Set();
    for (const scope of scopes) {
      const real = safeRealpath(scope.root);
      if (seenRoots.has(real)) continue;
      seenRoots.add(real);
      const dir = join2(scope.root, "personas");
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        const code2 = e.code;
        if (code2 !== "ENOENT" && code2 !== "ENOTDIR") {
          this.diagnostics.push(warn(
            "W_SCOPE_UNREADABLE",
            `could not read ${dir} (${code2 ?? e.message}), so its personas, units and panels are unavailable`,
            { file: dir, line: 1 },
            "Check the folder's permissions"
          ));
        }
        continue;
      }
      const names = entries.filter((e) => e.name.endsWith(".md") && isRegularFile(dir, e)).map((e) => e.name).sort();
      for (const f of names) {
        const kind = KINDS.find((k) => f.endsWith(SUFFIX[k]));
        if (!kind) {
          const path = join2(dir, f);
          this.diagnostics.push(warn(
            "W_UNTYPED_FILE",
            `${path} is neither a persona, unit, nor panel file, so it is ignored`,
            { file: path, line: 1 },
            "Rename it to <name>.persona.md, <name>.unit.md or <name>.panel.md, or move it out of this folder if it is not one of those"
          ));
          continue;
        }
        const name = f.slice(0, -SUFFIX[kind].length);
        if (name === "") continue;
        if (name.includes(":")) {
          const path = join2(dir, f);
          this.diagnostics.push(warn(
            "W_BAD_FILENAME",
            `${path} has a ":" in its name, so it is ignored`,
            { file: path, line: 1 },
            "Remove the colon; plugin namespaces come from the plugin manifest"
          ));
          continue;
        }
        this.files.push({ kind, name, scope, path: join2(dir, f), canonical: canonicalName(scope, name) });
      }
    }
  }
  scopes;
  files = [];
  diagnostics = [];
  all(kind) {
    return this.files.filter((f) => f.kind === kind);
  }
  lookup(kind, ref, at, below) {
    const colon = ref.indexOf(":");
    if (colon >= 0) {
      const plugin = ref.slice(0, colon);
      const name = ref.slice(colon + 1);
      const file = this.files.find((f) => f.kind === kind && f.scope.kind === "plugin" && f.scope.plugin === plugin && f.name === name);
      return file ? { file } : { diagnostic: this.unknown(kind, ref, at) };
    }
    let candidates = this.files.filter((f) => f.kind === kind && f.name === ref);
    if (below) candidates = candidates.filter((f) => RANK[f.scope.kind] > RANK[below.kind]);
    candidates.sort((a, b) => RANK[a.scope.kind] - RANK[b.scope.kind]);
    if (candidates.length === 0) {
      if (below) {
        return {
          diagnostic: err(
            "E_UNKNOWN_REF",
            `no ${kind} named "${ref}" exists in a scope below ${below.kind}`,
            at,
            `To extend a ${kind} with the same name, define it in a less specific scope; otherwise use a different name, or the namespaced form <plugin>:${ref} to reach another plugin's ${kind}`
          )
        };
      }
      return { diagnostic: this.unknown(kind, ref, at) };
    }
    const top = candidates[0];
    const pluginHits = candidates.filter((c) => c.scope.kind === "plugin");
    if (top.scope.kind === "plugin" && pluginHits.length > 1) {
      return {
        diagnostic: err("E_AMBIGUOUS", `"${ref}" is defined by more than one plugin`, at, `Use one of: ${pluginHits.map((c) => c.canonical).join(", ")}`)
      };
    }
    const shadowed = candidates.slice(1);
    return { file: top, shadow: shadowed.length > 0 ? { kind, name: ref, used: top, shadowed } : void 0 };
  }
  unknown(kind, ref, at) {
    const files = this.all(kind);
    const candidates = new Set(files.map((f) => f.canonical));
    const byName = /* @__PURE__ */ new Map();
    for (const f of files) byName.set(f.name, [...byName.get(f.name) ?? [], f]);
    for (const refs of byName.values()) {
      const pluginCount = new Set(refs.filter((r) => r.scope.kind === "plugin").map((r) => r.scope.plugin)).size;
      const hasNonPlugin = refs.some((r) => r.scope.kind !== "plugin");
      if (hasNonPlugin || pluginCount <= 1) candidates.add(refs[0].name);
    }
    const sug = didYouMean(ref, [...candidates]);
    return err(
      "E_UNKNOWN_REF",
      `unknown ${kind} "${ref}"`,
      at,
      sug ? `Did you mean "${sug}"?` : `Create personas/${ref.split(":").pop()}${SUFFIX[kind]} in a scope`
    );
  }
};

// src/cli/list.ts
var order = (a, b) => scopeRank(a.scope.kind) - scopeRank(b.scope.kind) || cmp(a.scope.plugin ?? "", b.scope.plugin ?? "") || cmp(a.name, b.name) || cmp(a.canonical, b.canonical);
function str(data, key) {
  const v = data?.[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function inspect(f) {
  let raw;
  try {
    raw = readFileSync5(f.path, "utf8");
  } catch {
    return { errorCount: 1 };
  }
  const diagnostics = f.kind === "unit" ? parseUnit(f.path, raw).diagnostics : f.kind === "panel" ? parsePanel(f.path, raw).diagnostics : parsePersona(f.path, raw).diagnostics;
  return {
    data: splitFrontmatter(f.path, raw).fm?.data,
    errorCount: diagnostics.filter((d) => d.level === "error").length
  };
}
function base(reg, f, info) {
  const winner = reg.lookup(f.kind, f.name).file;
  return {
    canonical: f.canonical,
    name: f.name,
    scope: f.scope.kind,
    plugin: f.scope.kind === "plugin" ? f.scope.plugin ?? null : null,
    path: f.path,
    description: str(info.data, "description"),
    shadowedBy: winner && winner.path !== f.path ? winner.path : null,
    valid: info.errorCount === 0,
    errorCount: info.errorCount
  };
}
function unitsOf(eff) {
  const brief = (tier) => eff.units[tier].map((u) => ({ canonical: u.canonical, description: u.unit.description, threshold: effectiveThreshold(u) }));
  return { primary: brief("primary"), secondary: brief("secondary"), deprioritized: brief("deprioritized") };
}
function listRows(reg) {
  const units = [...reg.all("unit")].sort(order).map((f) => {
    const info = inspect(f);
    return { ...base(reg, f, info), threshold: str(info.data, "threshold"), appliesWhen: str(info.data, "applies_when") };
  });
  const personaRows = [...reg.all("persona")].sort(order).map((f) => {
    const info = inspect(f);
    const b = base(reg, f, info);
    const eff = b.shadowedBy ? void 0 : resolvePersona(reg, f.canonical).effective;
    return { ...b, extends: str(info.data, "extends"), units: eff ? unitsOf(eff) : null, model: eff?.model ?? null };
  });
  const panels = [...reg.all("panel")].sort(order).map((f) => {
    const info = inspect(f);
    const checked = checkPanelFile(reg, f);
    const errorCount = checked.diagnostics.filter((d) => d.level === "error").length;
    const listed = info.data?.personas;
    const personas = Array.isArray(listed) ? listed.filter((x) => typeof x === "string") : [];
    const b = base(reg, f, { ...info, errorCount });
    return {
      canonical: b.canonical,
      name: b.name,
      scope: b.scope,
      plugin: b.plugin,
      path: b.path,
      description: b.description,
      personas,
      models: checked.panel?.models ?? {},
      shadowedBy: b.shadowedBy,
      valid: b.valid,
      errorCount: b.errorCount
    };
  });
  return { units, personas: personaRows, panels };
}
var scopeLabel = (r) => r.plugin ? `plugin ${r.plugin}` : r.scope;
function truncate(s, max) {
  if (max <= 1) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}\u2026`;
}
function formatListing(l, kinds, width = 80) {
  const all = [...l.units, ...l.personas, ...l.panels];
  const labelOfPath = (path) => {
    const r = all.find((x) => x.path === path);
    return r ? scopeLabel(r) : path;
  };
  const lines = [];
  for (const kind of kinds) {
    const rows = kind === "units" ? l.units : kind === "personas" ? l.personas : l.panels;
    lines.push(`${kind}:`);
    if (rows.length === 0) {
      lines.push("  (none)");
      continue;
    }
    let last = "";
    for (const r of rows) {
      const label = scopeLabel(r);
      if (label !== last) {
        lines.push(`  ${label}`);
        last = label;
      }
      const detail = kind === "units" ? r.threshold ?? "?" : kind === "personas" ? r.extends ? `extends ${r.extends}` : "root" : `personas ${r.personas.join(", ")}`;
      const head = `    ${r.name}  ${detail}`;
      const tail = [
        r.shadowedBy ? `(shadowed by ${labelOfPath(r.shadowedBy)})` : "",
        r.valid ? "" : `(invalid: ${r.errorCount} error${r.errorCount === 1 ? "" : "s"})`
      ].filter(Boolean).join(" ");
      const room = width - head.length - 3 - (tail ? tail.length + 1 : 0);
      const desc = truncate((r.description ?? "").replace(/\s+/g, " "), room);
      lines.push([head, desc ? `\u2014 ${desc}` : "", tail].filter(Boolean).join(" "));
    }
  }
  return lines.join("\n");
}

// src/library.ts
import { readFileSync as readFileSync6 } from "node:fs";
function checkLibrary(reg, userOnly) {
  const units = reg.all("unit").map((file) => {
    let raw;
    try {
      raw = readFileSync6(file.path, "utf8");
    } catch {
      return { file, diagnostics: [err("E_READ", `could not read ${file.path}`, { file: file.path, line: 1 }, "Check that the file still exists and is readable")] };
    }
    return { file, diagnostics: parseUnit(file.path, raw).diagnostics };
  });
  const personas = reg.all("persona").map((file) => {
    const shadowed = file.scope.kind === "user" && reg.lookup("persona", file.canonical).file?.path !== file.path;
    return { file, result: resolvePersona(shadowed ? userOnly : reg, file.canonical) };
  });
  const panels = reg.all("panel").map((file) => ({ file, diagnostics: checkPanelFile(reg, file).diagnostics }));
  return { units, personas, panels };
}

// src/panel/lineup.ts
var MODEL_SOURCES = ["panelist", "run", "panel", "persona", "session"];
var fail = (diagnostics) => ({ panel: null, panelists: [], diagnostics });
var lineupErr = (message, fix) => err("E_LINEUP", message, void 0, fix);
var badModel = (m, where) => lineupErr(`unknown model "${m}" ${where}`, hint(m, PANEL_MODELS) ?? `Use one of ${PANEL_MODELS.join(", ")}`);
function readName(token, ds) {
  const at = token.indexOf("@");
  const name = at < 0 ? { token, ref: token } : { token, ref: token.slice(0, at), model: token.slice(at + 1) };
  if (!REF.test(name.ref)) ds.push(lineupErr(`"${token}" is not a valid persona or panel name`, "Use a kebab-case name, or plugin:name, optionally followed by @<model>"));
  else if (name.model !== void 0 && !isPanelModel(name.model)) ds.push(badModel(name.model, `for ${name.ref}`));
  return name;
}
function row(reg, launch, file, layers, ds) {
  const eff = resolvePersona(reg, file.canonical).effective;
  if (!eff) ds.push(lineupErr(`${launch} does not resolve`, `Run: persona validate ${file.canonical}`));
  const persona = eff?.model ?? void 0;
  const [model, modelSource] = layers.panelist ? [layers.panelist, "panelist"] : layers.run ? [layers.run, "run"] : layers.panel ? [layers.panel, "panel"] : persona ? [persona, "persona"] : [null, "session"];
  return { persona: launch, canonical: file.canonical, model, modelSource };
}
function fromPanel(reg, file, tagged, run2) {
  const checked = checkPanelFile(reg, file);
  if (!checked.panel || hasErrors(checked.diagnostics)) return fail(checked.diagnostics);
  const ds = [...checked.diagnostics];
  const members = checked.panel.personas.map((p, i) => ({ ref: p.ref, file: checked.personas[i] }));
  const own = /* @__PURE__ */ new Map();
  for (const t of tagged) {
    const target = reg.lookup("persona", t.ref).file;
    const m = members.find((x) => x.ref === t.ref || target !== void 0 && x.file.path === target.path);
    if (!m) {
      ds.push(lineupErr(`${t.ref} is not on panel ${file.canonical}`, `Tag only the panel's own members (${members.map((x) => x.ref).join(", ")}), or list the personas instead to change the lineup`));
    } else if (own.has(m.file.path)) {
      ds.push(lineupErr(`${m.ref} is tagged twice`, "Give each member one model"));
    } else {
      own.set(m.file.path, t.model);
    }
  }
  if (hasErrors(ds)) return fail(ds);
  const panelModels = checked.panel.models;
  const panelists = members.map((m) => row(reg, m.ref, m.file, { panelist: own.get(m.file.path), run: run2, panel: Object.hasOwn(panelModels, m.ref) ? panelModels[m.ref] : void 0 }, ds));
  return hasErrors(ds) ? fail(ds) : { panel: file.canonical, panelists, diagnostics: ds };
}
function fromPersonas(reg, names, run2) {
  const ds = [];
  if (names.length < 2 || names.length > 6) {
    ds.push(err("E_PANEL_SIZE", `a panel needs 2 to 6 personas, this lineup has ${names.length}`, void 0, "Name between 2 and 6 personas, or one saved panel"));
  }
  const seated = [];
  for (const n of names) {
    const l = reg.lookup("persona", n.ref);
    if (!l.file) {
      const isPanel = reg.lookup("panel", n.ref).file !== void 0;
      const fix = isPanel ? `${n.ref} is a saved panel: tag every other name with @<m>, or list personas only` : l.diagnostic?.fix ?? "Use the name of an existing persona";
      ds.push(err("E_PANEL_PERSONA", `persona "${n.ref}" does not resolve`, void 0, fix));
      continue;
    }
    const dup = seated.find((s) => s.file.path === l.file.path);
    if (dup) {
      ds.push(err("E_PANEL_PERSONA", `"${n.ref}" and "${dup.name.ref}" are the same persona (${l.file.canonical})`, void 0, "List each persona once"));
      continue;
    }
    seated.push({ name: n, file: l.file });
  }
  if (hasErrors(ds)) return fail(ds);
  const panelists = seated.map((s) => row(reg, s.file.canonical, s.file, { panelist: s.name.model, run: run2 }, ds));
  return hasErrors(ds) ? fail(ds) : { panel: null, panelists, diagnostics: ds };
}
function resolveLineup(reg, input) {
  const ds = [];
  if (input.model !== void 0 && !isPanelModel(input.model)) ds.push(badModel(input.model, "in --model"));
  const names = input.names.map((t) => readName(t, ds));
  if (names.length === 0) ds.push(lineupErr("no lineup given", "Name a saved panel, or 2 to 6 personas"));
  if (hasErrors(ds)) return fail(ds);
  const run2 = input.model;
  const [first, ...rest] = names;
  const panelFile = reg.lookup("panel", first.ref).file;
  if (first.model === void 0 && panelFile && rest.every((n) => n.model !== void 0)) {
    const l = fromPanel(reg, panelFile, rest, run2);
    if (l.panel !== null && reg.lookup("persona", first.ref).file) {
      l.diagnostics.push(warn("W_LINEUP_AMBIGUOUS", `${first.ref} is both a saved panel and a persona; read as the panel`, void 0, `To mean the persona, put ${first.ref} after another name (tester@sonnet ${first.ref}); to mean the panel, keep it first. Or rename one`));
    }
    return l;
  }
  if (first.model !== void 0 && panelFile && !reg.lookup("persona", first.ref).file) {
    return fail([lineupErr(`${first.ref} is a saved panel, not a persona`, "Put a whole panel on one model with --model <m>")]);
  }
  return fromPersonas(reg, names, run2);
}

// src/panel/compare.ts
var STATUSES = ["ok", "malformed", "timeout", "error"];
var isObj2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var FIX = 'Pass the panel-result JSON the panel skill writes: { question, panel, panelists: [{ persona, status, judgment (required for "ok", optional otherwise), violations?, reason?, model?, modelSource? }] }';
function parsePanelResult(text) {
  const fail2 = (message) => ({ diagnostics: [err("E_PANEL_RESULT", message, void 0, FIX)] });
  if (text.trim() === "") return fail2("no panel result given");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail2("panel result is not valid JSON");
  }
  if (!isObj2(data)) return fail2("panel result must be a JSON object");
  if (typeof data.question !== "string" || data.question.trim() === "") return fail2('panel result needs a non-empty "question"');
  if (data.panel !== void 0 && data.panel !== null && typeof data.panel !== "string") return fail2('"panel" must be a string or null');
  if (!Array.isArray(data.panelists)) return fail2('"panelists" must be a list');
  const panelists = [];
  const seen = /* @__PURE__ */ new Set();
  for (const [i, p] of data.panelists.entries()) {
    if (!isObj2(p) || typeof p.persona !== "string" || p.persona.trim() === "") return fail2(`panelists[${i}] needs a "persona"`);
    if (seen.has(p.persona)) return fail2(`panelists[${i}] repeats persona ${p.persona}; replace the earlier entry instead`);
    seen.add(p.persona);
    if (typeof p.status !== "string" || !STATUSES.includes(p.status)) return fail2(`panelists[${i}] has an unknown status "${String(p.status)}"`);
    const status = p.status;
    if (status === "ok" && p.judgment === void 0) return fail2(`panelists[${i}] (${status}) needs a "judgment"`);
    const model = p.model === void 0 ? null : p.model;
    if (model !== null && (typeof model !== "string" || model.trim() === "")) return fail2(`panelists[${i}] "model" must be a non-empty string or null`);
    if (typeof model === "string" && model.trim() !== model) return fail2(`panelists[${i}] "model" has surrounding spaces`);
    const modelSource = p.modelSource === void 0 ? null : p.modelSource;
    if (modelSource !== null && !MODEL_SOURCES.includes(modelSource)) return fail2(`panelists[${i}] has an unknown modelSource "${String(modelSource)}"`);
    if (modelSource === "session" && model !== null) return fail2(`panelists[${i}] names model "${model}" but says it ran on the session model`);
    if (modelSource !== null && modelSource !== "session" && model === null) return fail2(`panelists[${i}] says its model came from "${modelSource}" but names no model`);
    panelists.push({
      persona: p.persona,
      status,
      judgment: p.judgment,
      violations: Array.isArray(p.violations) ? p.violations.filter((v) => typeof v === "string") : void 0,
      reason: typeof p.reason === "string" ? p.reason : void 0,
      model,
      modelSource
    });
  }
  return { result: { question: data.question, panel: typeof data.panel === "string" ? data.panel : null, panelists }, diagnostics: [] };
}
var isSecurity = (canonical) => canonical === "security" || canonical.endsWith(":security");
function proceedTension(j, eff) {
  if (j.verdict !== "proceed") return null;
  const primarySecurity = new Set(eff.units.primary.map((u) => u.canonical).filter(isSecurity));
  const marked = j.findings.filter((f2) => severityRank(f2.severity) >= severityRank("medium") || primarySecurity.has(f2.unit));
  if (marked.length === 0) return null;
  const top = Math.max(...marked.map((f2) => severityRank(f2.severity)));
  const f = marked.find((x) => severityRank(x.severity) === top);
  return `proceed despite its own ${f.severity} finding in ${f.unit}`;
}
function comparePanel(result, resolve7) {
  const verdicts = [];
  const followUps = [];
  const ok = [];
  for (const entry of result.panelists) {
    let status = entry.status;
    let reason = entry.reason ?? null;
    let verdict = null;
    let tension = null;
    if (status === "ok") {
      const eff = resolve7(entry.persona);
      if (!eff) {
        status = "error";
        reason = "persona does not resolve \u2014 fix the name before re-running";
      } else {
        const violations = validateJudgment(eff, entry.judgment);
        if (violations.length > 0) {
          status = "malformed";
          reason = `${violations.length} violation${violations.length === 1 ? "" : "s"}: ${violations[0]}`;
        } else {
          const j = entry.judgment;
          verdict = j.verdict;
          tension = proceedTension(j, eff);
          ok.push({ persona: entry.persona, eff, j, model: entry.model ?? null });
        }
      }
    } else if (status === "malformed" && reason === null) {
      const n = entry.violations?.length ?? 0;
      reason = n > 0 ? `${n} violation${n === 1 ? "" : "s"}: ${entry.violations[0]}` : "malformed judgment";
    }
    verdicts.push({ persona: entry.persona, status, verdict, reason, tension, model: entry.model ?? null, modelSource: entry.modelSource ?? null });
    if (status !== "ok") followUps.push({ type: "rerun", persona: entry.persona, reason: reason ?? status });
  }
  const unitIds = [...new Set(ok.flatMap(({ eff }) => TIERS.flatMap((t) => eff.units[t].map((u) => u.canonical))))].sort(cmp);
  const units = unitIds.map((unit) => {
    const cells = ok.map(({ persona, eff, j }) => {
      const tier = TIERS.find((t) => eff.units[t].some((u2) => u2.canonical === unit)) ?? "none";
      const found = j.findings.filter((f) => f.unit === unit);
      if (found.length > 0) {
        const top = Math.max(...found.map((f) => severityRank(f.severity)));
        const first = found.find((f) => severityRank(f.severity) === top);
        return { persona, tier, status: "flagged", severity: first.severity, claim: first.claim, why: null };
      }
      if (j.cleared.includes(unit)) return { persona, tier, status: "cleared", severity: null, claim: null, why: null };
      const na = j.not_applicable.find((n) => n.unit === unit);
      if (na) return { persona, tier, status: "not-applicable", severity: null, claim: null, why: na.reason };
      if (tier === "none") return { persona, tier, status: "not-raised", severity: null, claim: null, why: "not held" };
      const u = eff.units[tier].find((x) => x.canonical === unit);
      return { persona, tier, status: "not-raised", severity: null, claim: null, why: `not reported (threshold ${effectiveThreshold(u)})` };
    });
    const holders = cells.filter((c) => c.tier !== "none");
    const flaggers = cells.filter((c) => c.status === "flagged");
    const cls = flaggers.length === 0 ? "none" : holders.length === 1 ? "single-voice" : flaggers.length === holders.length ? "all-flag" : "split";
    return { unit, class: cls, cells };
  });
  const merged = { conditions: [], missing: [], investigate: [], sections: [] };
  const outsideScope = [];
  for (const { persona, eff, j } of ok) {
    for (const f of j.findings) if (f.unit === "outside-scope") outsideScope.push({ persona, severity: f.severity, claim: f.claim, evidence: f.evidence });
    for (const text of j.conditions ?? []) merged.conditions.push({ persona, text });
    for (const text of j.missing ?? []) merged.missing.push({ persona, text });
    for (const it of j.investigate ?? []) merged.investigate.push({ persona, what: it.what, why: it.why, tools: [...it.tools] });
    for (const s of eff.judgmentSections) {
      const text = j.sections?.[s.name];
      if (text !== void 0) merged.sections.push({ persona, name: s.name, text });
    }
  }
  for (const it of merged.investigate) followUps.push({ type: "investigate", ...it });
  return {
    question: result.question,
    panel: result.panel,
    verdicts,
    units,
    outsideScope,
    merged,
    followUps,
    ok: ok.length >= 2,
    mixedModels: new Set(ok.map((o) => o.model)).size > 1
  };
}
function cellText(c) {
  if (c.status === "flagged") return `${c.persona}: ${c.severity} (${c.tier}) "${c.claim}"`;
  if (c.status === "not-raised") return `${c.persona}: not raised \u2014 ${c.why}${c.tier === "none" ? "" : ` (${c.tier})`}`;
  if (c.status === "not-applicable") return `${c.persona}: not applicable (${c.tier}) \u2014 ${c.why}`;
  return `${c.persona}: cleared (${c.tier})`;
}
var modelTag = (v) => v.model ?? (v.modelSource === "session" ? "session model" : "not recorded");
function formatComparison(c) {
  const tagged = c.verdicts.some((v) => v.model !== null);
  const tagOf = new Map(c.verdicts.map((v) => [v.persona, ` [${modelTag(v)}]`]));
  const lines = [`Panel: ${c.panel ?? "ad-hoc"} \u2014 "${c.question}"`];
  if (tagged) lines.push(`Models: ${c.verdicts.map((v) => `${v.persona} [${modelTag(v)}]`).join(", ")}`);
  lines.push("", "Verdicts");
  for (const v of c.verdicts) {
    const body = v.status === "ok" ? `${v.verdict}${v.tension ? ` (${v.tension})` : ""}` : `${v.status}${v.reason ? ` (${v.reason})` : ""}`;
    lines.push(`- ${v.persona} \u2014 ${body}${tagged ? tagOf.get(v.persona) : ""}`);
  }
  const section = (title, rows, tagCells) => {
    lines.push("", title);
    if (rows.length === 0) lines.push("- (none)");
    for (const r of rows) lines.push(`- ${r.unit} [${r.class}]`, ...r.cells.map((x) => `    ${cellText(x)}${tagCells ? tagOf.get(x.persona) ?? "" : ""}`));
  };
  section("Where they disagree", c.units.filter((u) => u.class === "split" || u.class === "single-voice"), c.mixedModels);
  section("Where they agree", c.units.filter((u) => u.class === "all-flag"), false);
  lines.push(`- ${c.units.filter((u) => u.class === "none").length} unit(s) nobody raised`);
  lines.push("", "Outside their scope");
  if (c.outsideScope.length === 0) lines.push("- (none)");
  for (const o of c.outsideScope) lines.push(`- ${o.persona}: ${o.severity} "${o.claim}"`);
  lines.push("", "Conditions, missing information and sections");
  if (c.merged.conditions.length === 0 && c.merged.missing.length === 0 && c.merged.sections.length === 0) lines.push("- (none)");
  for (const x of c.merged.conditions) lines.push(`- ${x.persona} (condition): ${x.text}`);
  for (const x of c.merged.missing) lines.push(`- ${x.persona} (missing): ${x.text}`);
  for (const x of c.merged.sections) lines.push(`- ${x.persona} (${x.name}): ${x.text}`);
  lines.push("", "Follow-ups");
  if (c.followUps.length === 0) lines.push("- (none)");
  c.followUps.forEach((f, i) => {
    lines.push(f.type === "rerun" ? `${i + 1}. Re-run ${f.persona} (${f.reason})` : `${i + 1}. ${f.persona} wants to investigate: ${f.what} \u2014 ${f.why} (needs ${f.tools.join(", ")})`);
  });
  if (!c.ok) lines.push("", "not enough judgments to compare");
  return lines.join("\n");
}

// src/render/targets.ts
import { createHash } from "node:crypto";
import { readFileSync as readFileSync7 } from "node:fs";
var RESOLVER_VERSION = "0.2.0";
var MARKER = "# Generated by aska.";
var MARKERS = [MARKER, "# Generated by claude-personas."];
function generatedStem(p) {
  return p.canonical.replace(":", "--");
}
function generatedName(p) {
  return `${generatedStem(p)}-persona`;
}
function generatedFileName(p) {
  return `${generatedStem(p)}.persona.md`;
}
function panelTools(p) {
  const tools = ["Read", "Grep", "Glob"];
  const add = (t) => {
    if (!tools.includes(t)) tools.push(t);
  };
  for (const c of p.capabilities) add(c.kind === "mcp" ? `mcp__${c.name}` : "Skill");
  for (const t of p.tools) add(t);
  return tools;
}
function inputHash(p, read = (f) => readFileSync7(f, "utf8")) {
  const h = createHash("sha256");
  h.update(`claude-personas ${RESOLVER_VERSION}\0`);
  const pairs = p.inputs.map((path, i) => [p.inputIds[i], path]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  for (const [id, path] of pairs) h.update(`${id}\0${read(path)}\0`);
  return `sha256:${h.digest("hex")}`;
}
function frontmatter(p, hash, fields) {
  return [
    "---",
    `${MARKER} Do not edit; edit the source persona and run \`persona render\`.`,
    `# source: ${p.sourceId}`,
    `# persona: ${p.canonical}`,
    `# hash: ${hash}`,
    ...fields.map(([k, v]) => `${k}: ${v}`),
    "---"
  ].join("\n");
}
function outputStyleFile(p, hash) {
  const head = frontmatter(p, hash, [
    ["name", JSON.stringify(generatedName(p))],
    ["description", JSON.stringify(p.description)],
    ["keep-coding-instructions", "true"]
  ]);
  return `${head}

${renderPrompt(p, "swap")}`;
}
function subagentFile(p, hash) {
  const head = frontmatter(p, hash, [
    ["name", JSON.stringify(generatedName(p))],
    ["description", JSON.stringify(`Panel persona: ${p.description}`)],
    ["tools", JSON.stringify(panelTools(p).join(", "))]
  ]);
  return `${head}

${renderPrompt(p, "panel")}`;
}
function readMarker(content) {
  const lines = normalizeSource(content).split("\n");
  if (lines[0] !== "---" || !MARKERS.some((m) => lines[1]?.startsWith(m))) return void 0;
  const get = (key) => lines.slice(2, 6).find((l) => l.startsWith(`# ${key}: `))?.slice(key.length + 4);
  const source = get("source");
  const persona = get("persona");
  const hash = get("hash");
  return source && persona && hash ? { source, persona, hash } : void 0;
}

// src/render/write.ts
import { existsSync as existsSync3, mkdirSync, readFileSync as readFileSync8, readdirSync as readdirSync2, statSync as statSync4 } from "node:fs";
import { dirname as dirname2, join as join3 } from "node:path";
function chooseScope(p, requested) {
  const needed = p.inputScopes.includes("project") ? "project" : "user";
  if (requested === "user" && needed === "project") {
    return {
      diagnostic: err("E_RENDER_SCOPE", `${p.canonical} uses project-scope files, so it can only be rendered into the project scope`, void 0, "Use --scope project")
    };
  }
  return { scope: requested ?? needed };
}
function planRender(p, targets, requested) {
  const chosen = chooseScope(p, requested);
  if (!chosen.scope) return { diagnostics: [chosen.diagnostic] };
  const root = chosen.scope === "project" ? targets.projectClaudeDir : targets.userClaudeDir;
  const hash = inputHash(p);
  const file = generatedFileName(p);
  return {
    plan: {
      scope: chosen.scope,
      files: [
        { path: join3(root, "output-styles", file), content: outputStyleFile(p, hash) },
        { path: join3(root, "agents", file), content: subagentFile(p, hash) }
      ]
    },
    diagnostics: []
  };
}
function isRegularFile2(path) {
  try {
    return statSync4(path).isFile();
  } catch {
    return false;
  }
}
function isUnmarked(path) {
  if (!existsSync3(path)) return false;
  try {
    return !readMarker(readFileSync8(path, "utf8"));
  } catch {
    return true;
  }
}
function writePlan(plan) {
  const linked = plan.files.filter((f) => isSymlink(f.path)).map((f) => err("E_RENDER_SYMLINK", `${f.path} is a symlink; refusing to write through it`, { file: f.path, line: 1 }, "Remove the link (or replace it with a regular file), then render again"));
  if (linked.length > 0) return linked;
  const blocked = plan.files.filter((f) => isUnmarked(f.path)).map((f) => err("E_RENDER_UNMARKED", `${f.path} exists and was not generated by aska; refusing to overwrite it`, { file: f.path, line: 1 }, "Move or rename that file, then render again"));
  if (blocked.length > 0) return blocked;
  const written = [];
  for (const f of plan.files) {
    try {
      mkdirSync(dirname2(f.path), { recursive: true });
      writeAtomic(f.path, f.content);
    } catch (e) {
      const already = written.length > 0 ? ` (${written.join(", ")} ${written.length === 1 ? "was" : "were"} written)` : "";
      return [err("E_WRITE", `could not write ${f.path}: ${e.message}${already}`, { file: f.path, line: 1 }, "Check permissions on the target directory, then render again")];
    }
    written.push(f.path);
  }
  return [];
}
function findStaleRenders(targets, resolve7, runHint = (canonical) => `Run: persona render ${canonical}`, onlyFileName) {
  const ds = [];
  for (const dir of /* @__PURE__ */ new Set([targets.projectClaudeDir, targets.userClaudeDir])) {
    for (const sub of ["output-styles", "agents"]) {
      let files;
      try {
        files = readdirSync2(join3(dir, sub)).filter((f) => f.endsWith(".persona.md")).filter((f) => onlyFileName === void 0 || f === onlyFileName).filter((f) => isRegularFile2(join3(dir, sub, f))).sort();
      } catch {
        continue;
      }
      for (const f of files) {
        const path = join3(dir, sub, f);
        let raw;
        try {
          raw = readFileSync8(path, "utf8");
        } catch {
          ds.push(warn("W_READ", `could not read ${path}`, { file: path, line: 1 }, "Check that the file still exists and is readable"));
          continue;
        }
        const marker = readMarker(raw);
        if (!marker) continue;
        const p = resolve7(marker.persona);
        if (!p) {
          ds.push(warn("W_STALE_RENDER", `${path} was rendered from ${marker.persona}, which no longer resolves`, { file: path, line: 1 }, "Fix the persona, or delete the generated file"));
        } else if (p.sourceId !== marker.source) {
          ds.push(warn(
            "W_STALE_RENDER",
            `${path} was rendered from ${marker.source}, but ${marker.persona} now resolves to ${p.sourceId}`,
            { file: path, line: 1 },
            `Delete ${path}; ${marker.persona} now resolves to ${p.sourceId}`
          ));
        } else if (inputHash(p) !== marker.hash) {
          ds.push(warn("W_STALE_RENDER", `${path} is out of date with ${marker.persona}`, { file: path, line: 1 }, runHint(marker.persona)));
        }
      }
    }
  }
  return ds;
}

// src/resolve/report.ts
var local = (f) => f.scope.kind !== "plugin";
var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function activationLine(canonical, report2) {
  const unreviewed = report2.clashes.filter((c) => c.decision === "unreviewed" && local(c.layer)).length;
  const stale = report2.stale.filter((s) => local(s.layer)).length;
  if (unreviewed === 0 && stale === 0) return void 0;
  const parts = [unreviewed ? plural(unreviewed, "unreviewed override") : "", stale ? plural(stale, "stale override") : ""].filter(Boolean);
  return `${canonical}: ${parts.join(", ")} \u2014 run persona explain ${canonical}`;
}
function formatReport(report2) {
  const lines = [];
  if (report2.clashes.length > 0) {
    lines.push("Clashes:");
    for (const c of report2.clashes) {
      lines.push(`  [${c.decision}] ${c.id}  child: ${c.child}  parent: ${c.parent}  (${c.layer.canonical}, ${c.layer.scope.kind})`);
      if (c.dropped.length > 0) lines.push(`      dropped: ${c.dropped.join("; ")}`);
      if (c.decision === "unreviewed") lines.push(`      keep: add ${overrideLine(c.id, "child")} under overrides in ${c.layer.path}; flip: ${overrideLine(c.id, "parent")}`);
    }
  }
  if (report2.stale.length > 0) {
    lines.push("Stale overrides:");
    for (const s of report2.stale) lines.push(`  ${s.key} in ${s.layer.path}:${s.loc.line} matches no clash`);
  }
  if (report2.shadows.length > 0) {
    lines.push("Shadows (informational):");
    for (const s of report2.shadows) {
      const pins = s.shadowed.filter((f) => f.scope.kind === "plugin").map((f) => f.canonical);
      const others = s.shadowed.map((f) => `${f.scope.kind} (${f.path})`).join(", ");
      lines.push(`  ${s.kind} ${s.name}: using ${s.used.scope.kind} (${s.used.path}); shadows ${others}${pins.length > 0 ? `; pin with ${pins.join(" or ")}` : ""}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "No clashes, stale overrides or shadows.";
}

// src/author/files.ts
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync4 } from "node:fs";
import { join as join4, resolve as resolve3 } from "node:path";
var hashOf = (raw) => createHash2("sha256").update(raw).digest("hex");
function scopeRoot(d, scope, cwd2, home) {
  if (scope === "user") return { root: join4(resolve3(home), ".claude") };
  if (d.project.droppedClaudeDir !== void 0) {
    return { diagnostic: err("E_NO_SCOPE", "the project scope is the same folder as the user scope", void 0, "Use --scope user, or run from inside a project") };
  }
  if (d.project.claudeDir) return { root: d.project.claudeDir };
  const git = findGitRoot(cwd2);
  if (!git) {
    return { diagnostic: err("E_NO_SCOPE", "no project found above the working directory (no .claude folder and no git root)", void 0, "Run from inside a project, or use --scope user") };
  }
  return { root: join4(git, ".claude") };
}
var targetPath = (root, kind, name) => join4(root, "personas", `${name}${SUFFIX[kind]}`);
function writeFault(e, dir) {
  const message = e instanceof Error ? e.message : String(e);
  return err("E_WRITE", `could not write: ${message}`, void 0, `Check permissions on ${dir}`);
}
function staleCheck(path, expectHash) {
  if (expectHash === void 0) return void 0;
  const current = existsSync4(path) ? readIfExists(path) : void 0;
  if (expectHash === "none") {
    return current === void 0 ? void 0 : err("E_STALE", `${path} already exists`, { file: path, line: 1 }, "Reload it and edit the existing file instead of creating it");
  }
  if (current === void 0) return err("E_STALE", `${path} no longer exists`, { file: path, line: 1 }, "Reload; the file was deleted since you opened it");
  return hashOf(current) === expectHash ? void 0 : err("E_STALE", `${path} changed since you opened it`, { file: path, line: 1 }, "Reload it, then make your edit again");
}
var diagnosticJson = (d) => ({
  level: d.level,
  code: d.code,
  message: d.message,
  file: d.loc?.file ?? null,
  line: d.loc?.line ?? null,
  fix: d.fix ?? null
});

// src/cli/author.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync10, rmSync as rmSync3 } from "node:fs";
import { basename as basename3, dirname as dirname3, sep } from "node:path";

// src/author/show.ts
import { readFileSync as readFileSync9 } from "node:fs";
function findFile(reg, kind, name, scope) {
  if (scope === void 0) {
    const l = reg.lookup(kind, name);
    return l.file ? { file: l.file } : { diagnostic: l.diagnostic };
  }
  const namespaced = name.includes(":");
  const hits = reg.all(kind).filter((f) => f.scope.kind === scope && (namespaced ? f.canonical === name : f.name === name));
  if (hits.length === 1) return { file: hits[0] };
  if (hits.length === 0) {
    return { diagnostic: err("E_UNKNOWN_REF", `no ${kind} named "${name}" in ${scope} scope`, void 0, `Run: persona list ${kind}s`) };
  }
  return { diagnostic: err("E_AMBIGUOUS", `"${name}" is defined by more than one plugin`, void 0, `Use one of: ${hits.map((h) => h.canonical).join(", ")}`) };
}
function showFile(file) {
  const raw = readFileSync9(file.path, "utf8");
  const split = splitFrontmatter(file.path, raw);
  const sections = {};
  if (split.fm) {
    const body = splitSections(split.fm.body, split.fm.bodyStartLine);
    if (body.preamble) sections[""] = body.preamble.text;
    for (const s of body.sections) sections[s.heading] = s.text;
  }
  const parsed2 = file.kind === "unit" ? parseUnit(file.path, raw) : file.kind === "panel" ? parsePanel(file.path, raw) : parsePersona(file.path, raw);
  return {
    kind: file.kind,
    name: file.name,
    canonical: file.canonical,
    scope: file.scope.kind,
    plugin: file.scope.kind === "plugin" ? file.scope.plugin ?? null : null,
    path: file.path,
    hash: hashOf(raw),
    raw,
    fields: split.fm?.data ?? {},
    sections,
    diagnostics: parsed2.diagnostics
  };
}

// src/author/check.ts
import { cpSync, existsSync as existsSync5, mkdirSync as mkdirSync2, mkdtempSync, rmSync as rmSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { basename as basename2, join as join5 } from "node:path";
var keyOf = (d) => `${d.level}|${d.code}|${d.loc?.file ?? ""}|${d.loc?.line ?? ""}|${d.message}`;
var dedupe = (ds) => [...new Map(ds.map((d) => [keyOf(d), d])).values()];
function collectAll(scopes) {
  const reg = new Registry(scopes);
  const c = checkLibrary(reg, new Registry(scopes.filter((s) => s.kind !== "project")));
  return dedupe([
    ...reg.diagnostics,
    ...c.units.flatMap((u) => u.diagnostics),
    ...c.personas.flatMap((p) => p.result.diagnostics),
    ...c.panels.flatMap((p) => p.diagnostics)
  ]);
}
function checkInPlace(scopes, target, content) {
  const baseline = new Set(collectAll(scopes).map(keyOf));
  const staging = mkdtempSync(join5(tmpdir(), "aska-check-"));
  try {
    const dst = join5(staging, "personas");
    mkdirSync2(dst, { recursive: true });
    const src = join5(target.scope.root, "personas");
    if (existsSync5(src)) cpSync(src, dst, { recursive: true, dereference: true });
    const stagedFile = join5(dst, basename2(target.path));
    rmSync2(stagedFile, { force: true });
    if (content !== null) writeFileSync2(stagedFile, content);
    const stagedScope = { kind: target.scope.kind, root: staging };
    const present = scopes.some((s) => s.kind === target.scope.kind);
    const staged = present ? scopes.map((s) => s.kind === target.scope.kind ? stagedScope : s) : [stagedScope, ...scopes];
    const unstage = (s) => s.split(staging).join(target.scope.root);
    const all = dedupe(collectAll(staged).map((d) => ({
      ...d,
      message: unstage(d.message),
      fix: d.fix === void 0 ? void 0 : unstage(d.fix),
      loc: d.loc === void 0 ? void 0 : { ...d.loc, file: unstage(d.loc.file) }
    })));
    return {
      own: all.filter((d) => d.loc?.file === target.path),
      broken: all.filter((d) => d.level === "error" && d.loc?.file !== target.path && !baseline.has(keyOf(d)))
    };
  } finally {
    rmSync2(staging, { recursive: true, force: true });
  }
}

// src/author/patch.ts
var import_yaml3 = __toESM(require_dist(), 1);

// src/author/body.ts
var HEADING4 = /^ {0,3}##(?!#)\s+(.+?)(?:\s+#+)?\s*$/;
var FENCE2 = /^ {0,3}(`{3,}|~{3,})/;
function headings(lines) {
  const out = [];
  let fence;
  lines.forEach((line, index) => {
    const f = FENCE2.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = void 0;
      return;
    }
    if (f) {
      fence = f[1];
      return;
    }
    const h = HEADING4.exec(line);
    if (h) out.push({ index, key: sectionKey(h[1]) });
  });
  return out;
}
function hasHeadingLine(text) {
  return headings(text.split("\n")).length > 0;
}
var contentLines = (text) => {
  const t = text.replace(/^\n+/, "").replace(/\s+$/, "");
  return t === "" ? [] : t.split("\n");
};
function replaceSection(body, heading, text) {
  const lines = body.split("\n");
  const hs = headings(lines);
  const content = contentLines(text);
  if (heading === "") {
    const end2 = hs.length > 0 ? hs[0].index : lines.length;
    const rest = lines.slice(end2);
    const out2 = ["", ...content, ...rest.length > 0 ? ["", ...rest] : [""]].join("\n");
    return out2.endsWith("\n") ? out2 : `${out2}
`;
  }
  const i = hs.findIndex((h) => h.key === sectionKey(heading));
  if (i < 0) {
    const trimmed = body.replace(/\s+$/, "");
    return `${trimmed}

## ${heading}

${content.join("\n")}
`;
  }
  const start = hs[i].index;
  const end = i + 1 < hs.length ? hs[i + 1].index : lines.length;
  const after = lines.slice(end);
  const middle = content.length > 0 ? ["", ...content, ""] : [""];
  const out = [...lines.slice(0, start + 1), ...middle, ...after].join("\n");
  return out.endsWith("\n") ? out : `${out}
`;
}

// src/author/patch.ts
var OWNED = {
  unit: { fields: ["description", "applies_when", "threshold"], sections: ["Looks for", "Questions", "Red flags", "Good looks like"] },
  panel: { fields: ["description", "personas"], sections: [""] },
  persona: { fields: ["description", "model", "units.primary", "units.secondary", "units.deprioritized"], sections: ["Stance", "Tie-breaking"] }
};
var KEPT = { primary: ["add_questions", "add_red_flags"], secondary: [], deprioritized: [] };
function templateFor(kind, name, extendsRef) {
  if (kind === "persona" && extendsRef) return `---
name: ${name}
extends: ${extendsRef}
---
`;
  if (kind === "unit") return `---
name: ${name}
description: ""
threshold: medium
---

## Looks for

## Questions

## Red flags

## Good looks like
`;
  if (kind === "panel") return `---
name: ${name}
description: ""
personas: []
---
`;
  return `---
name: ${name}
description: ""
units:
  primary: []
---

## Stance

## Tie-breaking
`;
}
var isObj3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function checkValue(kind, path, v) {
  if (path === "description" || path === "applies_when") return typeof v === "string" ? void 0 : `"${path}" must be a string`;
  if (path === "extends") return typeof v === "string" && REF.test(v) ? void 0 : '"extends" must be a valid persona reference';
  if (path === "threshold") return typeof v === "string" && SEVERITIES.includes(v) ? void 0 : `"threshold" must be one of ${SEVERITIES.join(", ")}`;
  if (path === "personas") return Array.isArray(v) && v.every((x) => typeof x === "string" && REF.test(x)) ? void 0 : '"personas" must be a list of persona names';
  if (path === "model") return isPanelModel(v) ? void 0 : `"model" must be one of ${PANEL_MODELS.join(", ")}`;
  if (path.startsWith("units.")) {
    if (!Array.isArray(v)) return `"${path}" must be a list of { ref, threshold?, note? }`;
    for (const e of v) {
      if (!isObj3(e) || typeof e.ref !== "string" || !REF.test(e.ref)) return `every entry in "${path}" needs a valid "ref"`;
      const extra = Object.keys(e).filter((k) => k !== "ref" && k !== "threshold" && k !== "note");
      if (extra.length > 0) return `"${extra[0]}" can't be set through patch; use save to edit it`;
      if (e.threshold !== void 0 && !SEVERITIES.includes(String(e.threshold))) return `bad threshold on ${e.ref}`;
      if (e.note !== void 0 && typeof e.note !== "string") return `the note on ${e.ref} must be a string`;
    }
    return void 0;
  }
  return `"${path}" can't be patched on a ${kind}; use save to edit it`;
}
function validatePatch(kind, patch2, creating) {
  if (!isObj3(patch2)) return "the patch must be a JSON object";
  const extraKeys = Object.keys(patch2).filter((k) => k !== "set" && k !== "unset" && k !== "sections");
  if (extraKeys.length > 0) return `unknown patch key "${extraKeys[0]}"; use set, unset and sections`;
  const owned = OWNED[kind];
  if (patch2.set !== void 0) {
    if (!isObj3(patch2.set)) return '"set" must be an object of path: value';
    for (const [p, v] of Object.entries(patch2.set)) {
      if (p === "extends" && kind === "persona") {
        if (!creating) return '"extends" can only be set when creating a persona; use save to change it';
      } else if (!owned.fields.includes(p)) {
        return `"${p}" can't be patched on a ${kind}; use save to edit it`;
      }
      const bad = checkValue(kind, p, v);
      if (bad) return bad;
    }
  }
  if (patch2.unset !== void 0) {
    if (!Array.isArray(patch2.unset) || !patch2.unset.every((p) => typeof p === "string")) return '"unset" must be a list of paths';
    for (const p of patch2.unset) if (!owned.fields.includes(p)) return `"${p}" can't be patched on a ${kind}; use save to edit it`;
  }
  if (patch2.sections !== void 0) {
    if (!isObj3(patch2.sections)) return '"sections" must be an object of heading: text';
    for (const [h, t] of Object.entries(patch2.sections)) {
      if (!owned.sections.some((o) => sectionKey(o) === sectionKey(h))) return `section "${h}" can't be patched on a ${kind}; use save to edit it`;
      if (typeof t !== "string") return `section "${h}" must be text`;
      if (hasHeadingLine(t)) return `section "${h}" can't contain a "## " heading line; use save to edit headings`;
    }
  }
  return void 0;
}
function tierSettings(doc, tier) {
  const node = doc.getIn(["units", tier]);
  const out = /* @__PURE__ */ new Map();
  if (!(0, import_yaml3.isSeq)(node)) return out;
  for (const item of node.toJSON()) {
    if (typeof item === "string") out.set(item, {});
    else if (isObj3(item)) {
      const [ref, s] = Object.entries(item)[0] ?? [];
      if (ref) out.set(ref, isObj3(s) ? s : {});
    }
  }
  return out;
}
function entryValue(e, kept) {
  const settings = {};
  if (e.threshold !== void 0) settings.threshold = e.threshold;
  if (e.note !== void 0) settings.note = e.note;
  Object.assign(settings, kept);
  return Object.keys(settings).length === 0 ? e.ref : { [e.ref]: settings };
}
function ensureUnitsMap(doc, file, lineOf) {
  const node = doc.get("units", true);
  const empty = node === void 0 || (0, import_yaml3.isScalar)(node) && node.value === null;
  if (empty) {
    doc.setIn(["units"], doc.createNode({}));
    return void 0;
  }
  if (!(0, import_yaml3.isMap)(node)) {
    return err("E_FIELD_TYPE", "units must be a mapping of tiers", { file, line: lineOf(["units"]) }, `Write units as a mapping of ${TIERS.join(", ")}`);
  }
  return void 0;
}
function applyPatch(kind, name, existing, patch2, path) {
  const creating = existing === void 0;
  const bad = validatePatch(kind, patch2, creating);
  if (bad) return { usage: bad, warnings: [] };
  const p = patch2;
  const extendsRef = kind === "persona" && creating && typeof p.set?.extends === "string" ? p.set.extends : void 0;
  const base2 = existing ?? templateFor(kind, name, extendsRef);
  const file = path ?? name;
  const split = splitFrontmatter(file, base2);
  if (!split.fm) return { errors: split.diagnostics, warnings: [] };
  const fm = split.fm;
  const lines = normalizeSource(base2).split("\n");
  const doc = (0, import_yaml3.parseDocument)(lines.slice(1, fm.bodyStartLine - 2).join("\n"));
  let body = fm.body;
  const setEntries = Object.entries(p.set ?? {});
  const unsetPaths = p.unset ?? [];
  if (setEntries.some(([k]) => k.startsWith("units.")) || unsetPaths.some((k) => k.startsWith("units."))) {
    const unitsFault = ensureUnitsMap(doc, file, fm.lineOf);
    if (unitsFault) return { errors: [unitsFault], warnings: [] };
  }
  const oldPrimary = tierSettings(doc, "primary");
  for (const [fieldPath, value] of setEntries) {
    if (fieldPath === "extends") continue;
    const keys = fieldPath.split(".");
    if (keys[0] === "units") {
      const tier = keys[1];
      const before = tierSettings(doc, tier);
      const entries = value.map((e) => {
        const prev = before.get(e.ref) ?? {};
        const kept = Object.fromEntries(Object.entries(prev).filter(([k]) => KEPT[tier].includes(k)));
        return entryValue(e, kept);
      });
      doc.setIn(keys, doc.createNode(entries));
    } else {
      doc.setIn(keys, doc.createNode(value));
    }
  }
  for (const fieldPath of unsetPaths) doc.deleteIn(fieldPath.split("."));
  const owned = OWNED[kind];
  for (const [heading, text] of Object.entries(p.sections ?? {})) {
    const canonical = owned.sections.find((o) => sectionKey(o) === sectionKey(heading)) ?? heading;
    body = replaceSection(body, canonical, text);
  }
  const warnings = [];
  const newPrimary = tierSettings(doc, "primary");
  for (const [ref, s] of oldPrimary) {
    const dropped = KEPT.primary.filter((k) => s[k] !== void 0);
    if (dropped.length > 0 && !newPrimary.has(ref)) {
      warnings.push(warn(
        "W_DROPPED_SETTINGS",
        `${dropped.join(" and ")} on ${ref} were dropped because it left primary`,
        void 0,
        `Add ${ref} back to primary to keep them, or re-add them with save`
      ));
    }
  }
  return { raw: `---
${doc.toString({ lineWidth: 0, flowCollectionPadding: false })}---
${body}`, warnings };
}

// src/cli/author.ts
function printDiagnostics(ds, env) {
  for (const d of ds) env.out(formatDiagnostic(d));
}
function show(d, a, env) {
  const reg = new Registry(d.scopes);
  const found = findFile(reg, a.fileKind, a.name, a.scope);
  if (!found.file) {
    if (a.json) env.out(JSON.stringify({ diagnostics: [diagnosticJson(found.diagnostic)] }, null, 2));
    else printDiagnostics([found.diagnostic], env);
    return 1;
  }
  const s = showFile(found.file);
  if (a.json) env.out(JSON.stringify({ ...s, diagnostics: s.diagnostics.map(diagnosticJson) }, null, 2));
  else env.out(s.raw);
  return 0;
}
function report(o, a, env) {
  if (a.json) {
    env.out(JSON.stringify({ written: o.written, path: o.path, hash: o.hash, diagnostics: o.diagnostics.map(diagnosticJson) }, null, 2));
  } else {
    printDiagnostics(o.diagnostics, env);
    env.out(o.written ? `wrote ${o.path}` : "refused: nothing was written");
  }
  return o.written ? 0 : 1;
}
function locate(d, a, env) {
  const root = scopeRoot(d, a.scope, a.cwd, env.home);
  if (!root.root) return { code: report({ written: false, path: null, hash: null, diagnostics: [root.diagnostic] }, a, env) };
  const path = targetPath(root.root, a.fileKind, a.name);
  const current = readIfExists(path);
  const currentHash = current === void 0 ? null : hashOf(current);
  const project = dirname3(root.root);
  if (a.scope === "project" && isSymlink(path) && !safeRealpath(path).startsWith(safeRealpath(project) + sep)) {
    return { code: report({ written: false, path, hash: currentHash, diagnostics: [
      err("E_WRITE_SYMLINK", `${path} is a symlink to a file outside the project; refusing to write through it`, { file: path, line: 1 }, "Remove the link, or point it at a file inside the project")
    ] }, a, env) };
  }
  const stale = staleCheck(path, a.expectHash);
  if (stale) return { code: report({ written: false, path, hash: currentHash, diagnostics: [stale] }, a, env) };
  return { root: root.root, path, current, currentHash };
}
function checkAndWrite(d, a, env, at, content, extra = []) {
  const { path, currentHash } = at;
  const split = splitFrontmatter(path, content);
  const named = split.fm?.data.name;
  if (typeof named === "string" && named !== a.name) {
    const line = split.fm?.lineOf(["name"]) ?? 2;
    return report({
      written: false,
      path,
      hash: currentHash,
      diagnostics: [err("E_NAME_MISMATCH", `the file's name is "${named}", not "${a.name}"`, { file: path, line }, `Set name: ${a.name}, or save it under the name "${named}"`)]
    }, a, env);
  }
  let check;
  try {
    check = checkInPlace(d.scopes, { scope: { kind: a.scope, root: at.root }, path }, content);
  } catch (e) {
    return report({ written: false, path, hash: currentHash, diagnostics: [writeFault(e, dirname3(path))] }, a, env);
  }
  const diagnostics = [...extra, ...check.own, ...check.broken];
  if (hasErrors(diagnostics)) return report({ written: false, path, hash: currentHash, diagnostics }, a, env);
  try {
    mkdirSync3(dirname3(path), { recursive: true });
    writeAtomic(path, content);
  } catch (e) {
    return report({ written: false, path, hash: currentHash, diagnostics: [...diagnostics, writeFault(e, dirname3(path))] }, a, env);
  }
  return report({ written: true, path, hash: hashOf(content), diagnostics }, a, env);
}
function save(d, a, env) {
  let content;
  try {
    content = readFileSync10(a.file, "utf8");
  } catch {
    env.out(`could not read ${a.file}`);
    return 2;
  }
  const at = locate(d, a, env);
  if ("code" in at) return at.code;
  return checkAndWrite(d, a, env, at, content);
}
function patch(d, a, env) {
  let body;
  try {
    body = JSON.parse(readFileSync10(a.file, "utf8"));
  } catch {
    env.out(`could not read a JSON patch from ${a.file}`);
    return 2;
  }
  const at = locate(d, a, env);
  if ("code" in at) return at.code;
  const applied = applyPatch(a.fileKind, a.name, at.current, body, at.path);
  if (applied.usage) {
    env.out(applied.usage);
    return 2;
  }
  if (applied.errors) return report({ written: false, path: at.path, hash: at.currentHash, diagnostics: applied.errors }, a, env);
  return checkAndWrite(d, a, env, at, applied.raw, applied.warnings);
}
function describeDependent(d) {
  const path = d.loc?.file ?? null;
  const file = path === null ? "" : basename3(path);
  const kind = Object.keys(SUFFIX).find((k) => file.endsWith(SUFFIX[k])) ?? null;
  return { kind, name: kind ? file.slice(0, -SUFFIX[kind].length) : null, path, message: d.message };
}
function del(d, a, env) {
  const out = (deleted, path2, dependents, diagnostics) => {
    if (a.json) {
      env.out(JSON.stringify({ deleted, path: path2, dependents: dependents.map(describeDependent), diagnostics: diagnostics.map(diagnosticJson) }, null, 2));
    } else {
      printDiagnostics([...diagnostics, ...dependents], env);
      env.out(deleted ? `deleted ${path2}` : "refused: nothing was deleted");
    }
    return deleted ? 0 : 1;
  };
  const root = scopeRoot(d, a.scope, a.cwd, env.home);
  if (!root.root) return out(false, null, [], [root.diagnostic]);
  const path = targetPath(root.root, a.fileKind, a.name);
  if (readIfExists(path) === void 0) {
    return out(false, path, [], [err("E_UNKNOWN_REF", `no ${a.fileKind} named "${a.name}" in ${a.scope} scope`, void 0, `Run: persona list ${a.fileKind}s`)]);
  }
  const stale = staleCheck(path, a.expectHash);
  if (stale) return out(false, path, [], [stale]);
  let broken;
  try {
    broken = checkInPlace(d.scopes, { scope: { kind: a.scope, root: root.root }, path }, null).broken;
  } catch (e) {
    return out(false, path, [], [writeFault(e, dirname3(path))]);
  }
  if (broken.length > 0 && !a.force) return out(false, path, broken, []);
  try {
    rmSync3(path);
  } catch (e) {
    return out(false, path, broken, [writeFault(e, dirname3(path))]);
  }
  return out(true, path, broken, []);
}
function authorCmd(d, a, env) {
  switch (a.command) {
    case "show":
      return show(d, a, env);
    case "save":
      return save(d, a, env);
    case "patch":
      return patch(d, a, env);
    case "delete":
      return del(d, a, env);
  }
}

// src/cli/lineup.ts
function lineupCmd(reg, base2, p, env) {
  const l = resolveLineup(reg, { names: p.names, model: p.model });
  const diagnostics = [...base2, ...l.diagnostics];
  env.out(JSON.stringify({ panel: l.panel, panelists: l.panelists, diagnostics: diagnostics.map(diagnosticJson) }, null, 2));
  return hasErrors(diagnostics) ? 1 : 0;
}

// src/runs/store.ts
import { randomInt } from "node:crypto";
import { chmodSync as chmodSync2, existsSync as existsSync6, mkdirSync as mkdirSync4, readdirSync as readdirSync3, readFileSync as readFileSync11, realpathSync as realpathSync2, statSync as statSync5 } from "node:fs";
import { basename as basename4, dirname as dirname4, isAbsolute, join as join6, relative, resolve as resolve4 } from "node:path";
var RUN_ID = /^\d{8}T\d{6}Z-[A-Za-z0-9]{6}$/;
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
var ATTEMPTS = 5;
var runsRoot = (home) => join6(resolve4(home), ".claude", "aska", "runs");
function runsDir(home, env = {}) {
  const value = env.ASKA_RUNS_DIR;
  if (value === void 0 || value === "") return { root: runsRoot(home) };
  const bad = (why, fix) => ({ diagnostic: err("E_RUNS_DIR", `ASKA_RUNS_DIR ${JSON.stringify(value)} ${why}`, void 0, fix) });
  if (!isAbsolute(value)) return bad("is not an absolute path", "Set ASKA_RUNS_DIR to an absolute path, or unset it to keep runs in ~/.claude/aska/runs");
  let st;
  try {
    st = statSync5(value);
  } catch {
    return { root: resolve4(value) };
  }
  if (!st.isDirectory()) return bad("is not a directory", "Point ASKA_RUNS_DIR at a folder (it is created if it does not exist)");
  const uid = process.getuid?.();
  if (uid !== void 0 && st.uid !== uid) return bad("is owned by another user, so it cannot be kept owner-only", "Point ASKA_RUNS_DIR at a folder you own");
  return { root: resolve4(value) };
}
function randomSuffix() {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
var runId = (at, suffix) => `${at.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "")}-${suffix}`;
var metaText = (m) => `${JSON.stringify(m, null, 2)}
`;
function realAncestor(path) {
  let existing = resolve4(path);
  const tail = [];
  while (!existsSync6(existing)) {
    const parent = dirname4(existing);
    if (parent === existing) break;
    tail.unshift(basename4(existing));
    existing = parent;
  }
  return tail.length > 0 ? join6(realpathSync2(existing), ...tail) : realpathSync2(existing);
}
var inside = (path, dir) => {
  const rel = relative(dir, path);
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
};
var realOrSelf = (path) => {
  try {
    return realpathSync2(path);
  } catch {
    return resolve4(path);
  }
};
function coreConfig(gitDir) {
  let text;
  try {
    text = readFileSync11(join6(gitDir, "config"), "utf8");
  } catch {
    return { bare: false };
  }
  let core = false;
  let bare = false;
  let worktree;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const section = /^\[\s*([A-Za-z0-9.-]+)\s*(?:"[^"]*")?\s*\]/.exec(line);
    if (section) {
      core = section[1].toLowerCase() === "core";
      continue;
    }
    const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!core || !kv) continue;
    const value = kv[2].replace(/^"(.*)"$/, "$1");
    if (kv[1].toLowerCase() === "bare") bare = /^(true|yes|on|1)$/i.test(value);
    if (kv[1].toLowerCase() === "worktree") worktree = resolve4(gitDir, value);
  }
  return { bare, worktree };
}
var isGitDir = (dir) => {
  try {
    return statSync5(join6(dir, "HEAD")).isFile() && statSync5(join6(dir, "objects")).isDirectory() && statSync5(join6(dir, "refs")).isDirectory();
  } catch {
    return false;
  }
};
function separateWorkTree(gitDir) {
  const { bare, worktree } = coreConfig(gitDir);
  if (worktree) return worktree;
  return bare && existsSync6(join6(gitDir, "index")) ? dirname4(resolve4(gitDir)) : void 0;
}
function enclosingWorkTree(path, env = {}) {
  const real = realAncestor(path);
  const git = findGitRoot(real);
  if (git) return { workTree: git };
  if (env.GIT_WORK_TREE && inside(real, realOrSelf(env.GIT_WORK_TREE))) return { workTree: env.GIT_WORK_TREE };
  if (env.GIT_DIR) {
    const wt = separateWorkTree(env.GIT_DIR);
    if (wt && inside(real, realOrSelf(wt))) return { workTree: wt, gitDir: env.GIT_DIR };
  }
  for (let d = real; ; d = dirname4(d)) {
    let names = [];
    try {
      names = readdirSync3(d, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== ".git").map((e) => e.name);
    } catch {
    }
    for (const name of names) {
      const gitDir = join6(d, name);
      if (!isGitDir(gitDir)) continue;
      const wt = separateWorkTree(gitDir);
      if (wt && inside(real, realOrSelf(wt))) return { workTree: wt, gitDir };
    }
    if (dirname4(d) === d) return void 0;
  }
}
function ownerOnly(path) {
  try {
    const mode = statSync5(path).mode & 511;
    if ((mode & 63) !== 0) chmodSync2(path, mode & 448);
  } catch {
  }
}
function createRun(home, cwd2, deps = {}) {
  const env = deps.env ?? {};
  const where = runsDir(home, env);
  if ("diagnostic" in where) return where;
  const { root } = where;
  const repo = enclosingWorkTree(root, env);
  if (repo) {
    const tree = repo.gitDir ? `${repo.workTree}, the work tree of the git repository ${repo.gitDir}` : `the git working tree ${repo.workTree}`;
    return {
      diagnostic: err(
        "E_RUNS_IN_REPO",
        `the run store ${root} is inside ${tree}`,
        void 0,
        `Move the run store out of ${repo.workTree}: set ASKA_RUNS_DIR in the environment Claude Code runs in to an absolute path outside every git working tree; or move ${root} to such a folder and symlink it back at ${root}; or set PERSONA_HOME to a home outside every git working tree \u2014 runs then go in $PERSONA_HOME/.claude/aska/runs, and this also moves your user-scope personas and units`
      )
    };
  }
  const git = findGitRoot(cwd2);
  const at = (deps.now ?? (() => /* @__PURE__ */ new Date()))();
  const suffix = deps.suffix ?? randomSuffix;
  try {
    mkdirSync4(root, { recursive: true, mode: 448 });
    ownerOnly(root);
    for (let i = 0; i < ATTEMPTS; i++) {
      const id = runId(at, suffix());
      const dir = join6(root, id);
      try {
        mkdirSync4(dir, { mode: 448 });
      } catch (e) {
        if (e.code === "EEXIST") continue;
        throw e;
      }
      const meta = {
        schemaVersion: 1,
        id,
        source: "aska",
        projectPath: resolve4(git ?? cwd2),
        question: null,
        panel: null,
        panelists: [],
        startedAt: at.toISOString(),
        comparedAt: null
      };
      writeAtomic(join6(dir, "meta.json"), metaText(meta));
      return { dir, meta };
    }
    return { diagnostic: err("E_RUNS_WRITE", `could not create a run folder in ${root}: ${ATTEMPTS} ids were already taken`, void 0, "Run the command again") };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      diagnostic: err(
        "E_RUNS_WRITE",
        `could not create a run folder in ${root}: ${message}`,
        void 0,
        `Check that ${root} is writable, or keep this run in a temporary folder`
      )
    };
  }
}
var nullableString = (v) => v === null || typeof v === "string";
var absentOrNullableString = (v) => v === void 0 || nullableString(v);
var validPanelistRow = (v) => typeof v === "object" && v !== null && typeof v.persona === "string" && typeof v.status === "string" && nullableString(v.verdict) && absentOrNullableString(v.model) && absentOrNullableString(v.modelSource);
function readMeta(dir) {
  let data;
  try {
    data = JSON.parse(readFileSync11(join6(dir, "meta.json"), "utf8"));
  } catch (e) {
    return { reason: e.code === "ENOENT" ? "no meta.json" : "meta.json is not readable JSON" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { reason: "meta.json is not an object" };
  const m = data;
  if (m.schemaVersion !== 1 || m.source !== "aska") return { reason: 'meta.json is not an aska run (schemaVersion 1, source "aska")' };
  if (typeof m.id !== "string" || !RUN_ID.test(m.id) || typeof m.projectPath !== "string" || typeof m.startedAt !== "string" || !Array.isArray(m.panelists) || !nullableString(m.question) || !nullableString(m.panel) || !nullableString(m.comparedAt) || !m.panelists.every(validPanelistRow)) {
    return { reason: "meta.json is missing a valid id, projectPath, startedAt, question, panel, comparedAt or panelists" };
  }
  return { meta: m };
}
function recordComparison(dir, c, at) {
  const { meta, reason } = readMeta(dir);
  if (!meta) return `not recording: ${dir}: ${reason}`;
  ownerOnly(dir);
  const next = {
    ...meta,
    question: c.question,
    panel: c.panel,
    panelists: c.verdicts.map((v) => ({ persona: v.persona, status: v.status, verdict: v.verdict, model: v.model, modelSource: v.modelSource })),
    comparedAt: at.toISOString()
  };
  try {
    writeAtomic(join6(dir, "meta.json"), metaText(next));
    return void 0;
  } catch (e) {
    return `not recording: could not write ${join6(dir, "meta.json")}: ${e instanceof Error ? e.message : String(e)}`;
  }
}
function listRuns(home, env = {}) {
  const where = runsDir(home, env);
  if ("diagnostic" in where) return { runs: [], skipped: [], diagnostic: where.diagnostic };
  const { root } = where;
  if (!existsSync6(root)) return { runs: [], skipped: [] };
  const names = readdirSync3(root, { withFileTypes: true }).filter((e) => e.isDirectory() && RUN_ID.test(e.name)).map((e) => e.name);
  const runs = [];
  const skipped = [];
  for (const name of names) {
    const path = join6(root, name);
    const { meta, reason } = readMeta(path);
    if (!meta) skipped.push({ path, reason });
    else if (meta.id !== name) skipped.push({ path, reason: `meta.json id ${meta.id} does not match the folder name` });
    else runs.push({ ...meta, path });
  }
  runs.sort((a, b) => a.startedAt !== b.startedAt ? a.startedAt < b.startedAt ? 1 : -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  return { runs, skipped };
}

// src/cli/runs.ts
function runsCmd(p, env) {
  if (p.command === "new") {
    const r = createRun(env.home, p.cwd, { now: env.now, env: env.runsEnv });
    if ("diagnostic" in r) {
      env.out(formatDiagnostic(r.diagnostic));
      return 1;
    }
    env.out(r.dir);
    return 0;
  }
  const { runs, skipped, diagnostic } = listRuns(env.home, env.runsEnv);
  if (diagnostic) {
    env.out(formatDiagnostic(diagnostic));
    return 1;
  }
  for (const s of skipped) (env.err ?? env.out)(`warning: skipped ${s.path}: ${s.reason}`);
  if (p.json) {
    env.out(JSON.stringify(runs, null, 2));
    return 0;
  }
  const width = env.columns ?? 80;
  for (const r of runs) {
    const what = r.comparedAt === null ? "(not compared)" : `${r.panel ?? "ad-hoc"} ${(r.question ?? "").replace(/\s+/g, " ")}`;
    const line = `${r.startedAt} ${r.id} ${what}`;
    env.out(line.length > width ? `${line.slice(0, width - 1)}\u2026` : line);
  }
  return 0;
}

// src/cli/gate.ts
import { readFileSync as readFileSync12 } from "node:fs";

// src/gate/result.ts
var bySeverity = (a, b) => severityRank(b.severity) - severityRank(a.severity);
function gateResult(judgment, violations, targets) {
  if (violations.length > 0) return { result: "fail", broken: [], deferred: [], conditions: [], findings_outside_targets: [], violations };
  const j = judgment;
  const order2 = targets.map((t) => t.id);
  const checks = [...j.checks].sort((a, b) => order2.indexOf(a.id) - order2.indexOf(b.id));
  const broken = checks.filter((c) => c.status === "broken").map((c) => c.id);
  const deferred = checks.filter((c) => c.status === "deferred").map((c) => ({ id: c.id, needs: c.needs }));
  const conditions = j.conditions ?? [];
  const findings_outside_targets = j.findings.filter((f) => f.check === void 0).map((f) => ({ unit: f.unit, severity: f.severity, claim: f.claim })).sort(bySeverity);
  const failed = broken.length > 0 || j.verdict === "stop" || j.verdict === "insufficient-information";
  const result = failed ? "fail" : j.verdict === "proceed-with-conditions" || deferred.length > 0 ? "pass-with-conditions" : "pass";
  return { result, broken, deferred, conditions, findings_outside_targets, violations: [] };
}
function formatGate(r, judgment) {
  if (r.violations.length > 0) return ["FAIL \u2014 invalid judgment", ...r.violations.map((v) => `- ${v}`)].join("\n");
  const j = judgment;
  const linked = (id) => j.findings.filter((f) => f.check === id).sort(bySeverity);
  const parts = [];
  let headline;
  if (r.result === "fail") {
    for (const id of r.broken) {
      const top = linked(id)[0];
      parts.push(`${id} broken (${top.severity}: ${top.claim})`);
    }
    if (j.verdict === "stop" || j.verdict === "insufficient-information") parts.push(`verdict ${j.verdict}`);
    headline = `FAIL \u2014 ${parts.join("; ")}`;
  } else if (r.result === "pass-with-conditions") {
    for (const d of r.deferred) parts.push(`${d.id} deferred (needs: ${d.needs})`);
    if (r.conditions.length > 0) parts.push(`${r.conditions.length} condition${r.conditions.length === 1 ? "" : "s"}`);
    headline = `PASS WITH CONDITIONS \u2014 ${parts.join("; ")}`;
  } else {
    headline = "PASS";
  }
  const lines = [headline];
  if (r.broken.length > 0) {
    lines.push("", "Broken:");
    for (const id of r.broken) for (const f of linked(id)) lines.push(`- ${id} [${f.severity}] ${f.unit}: ${f.claim}`);
  }
  if (r.deferred.length > 0) lines.push("", "Deferred:", ...r.deferred.map((d) => `- ${d.id}: ${d.needs}`));
  if (r.conditions.length > 0) lines.push("", "Conditions:", ...r.conditions.map((c) => `- ${c}`));
  if (r.findings_outside_targets.length > 0) lines.push("", "Other findings:", ...r.findings_outside_targets.map((f) => `- [${f.severity}] ${f.unit}: ${f.claim}`));
  return lines.join("\n");
}

// src/cli/gate.ts
function targetsCmd(from, fromGiven, out, env) {
  let md;
  try {
    md = readFileSync12(from, "utf8");
  } catch {
    env.out(`could not read ${from}`);
    return 1;
  }
  const r = extractTargets(md);
  if ("error" in r) {
    env.out(r.error === "no-section" ? `${fromGiven} has no "## Adversarial review targets" section` : `${fromGiven}: the "## Adversarial review targets" section has no bullets`);
    return 1;
  }
  const json = JSON.stringify({ source: fromGiven, targets: r.targets }, null, 2);
  if (out === void 0) {
    env.out(json);
    return 0;
  }
  try {
    writeAtomic(out, `${json}
`);
  } catch {
    env.out(`could not write ${out}`);
    return 1;
  }
  env.out(`wrote ${r.targets.length} targets to ${out}`);
  return 0;
}
function gateCmd(reg, name, file, checks, json, env) {
  const say = json ? (message) => env.out(JSON.stringify({ error: message }, null, 2)) : env.out;
  const targets = loadTargets(checks, { ...env, out: say });
  if (targets === void 0) return 2;
  const input = readInput(file, env);
  if (input.error) {
    say(input.error);
    return 2;
  }
  const violations = [];
  let judgment;
  const text = (input.text ?? "").trim();
  if (text === "") violations.push("no input");
  else {
    try {
      judgment = JSON.parse(text);
    } catch {
      violations.push("not valid JSON");
    }
  }
  if (violations.length === 0) {
    const r = resolvePersona(reg, name);
    if (!r.effective) violations.push(`persona "${name}" does not resolve`);
    else violations.push(...validateJudgment(r.effective, judgment, targets));
  }
  const result = gateResult(judgment, violations, targets);
  env.out(json ? JSON.stringify(result, null, 2) : formatGate(result, judgment));
  return result.result === "fail" ? 1 : 0;
}

// src/cli/main.ts
var USAGE = [
  "usage: persona <command> [options]",
  "",
  "  validate [name]                        check one persona, or every persona, unit and panel",
  "  explain <name>                         show the effective persona, clash report and prompt",
  "  render <name> [--scope project|user]   write the output style and the panel subagent",
  "  list [units|personas|panels] [--json]  show every unit, persona and panel in every scope",
  "  prompt <name> --panel [--checks <targets.json>]   print a persona's panel prompt, with review targets if given",
  "  check-judgment <name> [--file <path>] [--checks <targets.json>]   validate a judgment (JSON from the file or stdin)",
  "  check-evidence [--file <path>]         validate an investigator's evidence (markdown from the file or stdin)",
  "  compare [--file <path>] [--json] [--record]   compare a panel's judgments (panel-result JSON); --record updates the run's meta.json",
  "  lineup --json [--model <m>] <panel> [<member>@<m> \u2026] | <persona>[@<m>] \u2026   who sits on a panel and the model each runs on",
  "  runs new                               create a kept panel-run folder and print its path",
  "  runs list [--json]                     list kept panel runs, newest first",
  "  targets --from <file.md> [--out <targets.json>]   extract a step file's adversarial review targets",
  "  gate [<name>] --file <judgment.json> --checks <targets.json> [--json]   decide a gate as persona <name> (default gate): pass, pass with conditions, or fail",
  "  show <kind> <name> [--scope s] [--json]   print one unit, persona or panel file (kind: unit|persona|panel)",
  "  save <kind> <name> --scope project|user --file <md> [--expect-hash h] [--json]   check a whole file as if in place, then write it",
  "  patch <kind> <name> --scope project|user --file <json> [--expect-hash h] [--json]  apply form edits, check, then write",
  "  delete <kind> <name> --scope project|user [--force] [--expect-hash h] [--json]  remove a file; refuses if others depend on it",
  "",
  "options:",
  "  --cwd <dir>   run as if from <dir>",
  "  -h, --help    show this help"
].join("\n");
var indent = (text) => text.split("\n").map((l) => `  ${l}`).join("\n");
function finish2(ds, env) {
  const unique = [...new Map(ds.map((d) => [formatDiagnostic(d), d])).values()];
  for (const d of unique) env.out(formatDiagnostic(d));
  const errors = unique.filter((d) => d.level === "error").length;
  const warnings = unique.length - errors;
  env.out(`${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`);
  return errors > 0 ? 1 : 0;
}
function describeEffective(p) {
  const list3 = (us, numbered) => us.length === 0 ? "(none)" : us.map((u, i) => `${numbered ? `${i + 1}. ` : ""}${u.canonical} (${effectiveThreshold(u)})`).join(numbered ? "  " : ", ");
  const caps = p.capabilities.length === 0 ? "(none)" : p.capabilities.map((c) => `${c.kind === "skills" ? "skill" : "mcp"} ${c.name}`).join(", ");
  return [
    `== ${p.canonical} (${p.source}) ==`,
    p.description,
    `primary:       ${list3(p.units.primary, true)}`,
    `secondary:     ${list3(p.units.secondary, false)}`,
    `deprioritized: ${list3(p.units.deprioritized, false)}`,
    `capabilities:  ${caps}`,
    `panel tools:   ${panelTools(p).join(", ")}`,
    ...p.model ? [`model:         ${p.model} (default for panels)`] : [],
    "inputs:",
    ...p.inputs.map((f) => `  ${f}`)
  ].join("\n");
}
function scopeKindsByName(files) {
  const kinds = /* @__PURE__ */ new Map();
  for (const f of files) kinds.set(f.name, (kinds.get(f.name) ?? /* @__PURE__ */ new Set()).add(f.scope.kind));
  return kinds;
}
function validate(reg, userOnlyReg, base2, targets, dropped, name, env) {
  const ds = [...base2];
  const printStatus = (r, label) => {
    ds.push(...r.diagnostics);
    env.out(`${label}: ${r.effective ? "ok" : "failed"}`);
    const { clashes, stale, shadows } = r.report;
    if (clashes.length + stale.length + shadows.length > 0) env.out(indent(formatReport(r.report)));
  };
  const staleRenderDiagnostics = (onlyFileName) => {
    const result = [];
    if (!dropped) {
      result.push(...findStaleRenders(
        { projectClaudeDir: targets.projectClaudeDir, userClaudeDir: targets.projectClaudeDir },
        (c2) => resolvePersona(reg, c2).effective,
        void 0,
        onlyFileName
      ));
    }
    result.push(...findStaleRenders(
      { projectClaudeDir: targets.userClaudeDir, userClaudeDir: targets.userClaudeDir },
      (c2) => resolvePersona(userOnlyReg, c2).effective,
      // A project persona of the same name shadows this one from inside the project, so
      // `persona render <name>` run here would render the project version, not fix this
      // user-scope file.
      (c2) => reg.lookup("persona", c2).file?.scope.kind === "project" ? `Run: persona render ${c2} from outside this project` : `Run: persona render ${c2}`,
      onlyFileName
    ));
    return result;
  };
  if (name) {
    const r = resolvePersona(reg, name);
    if (!r.effective) {
      const panelFile = reg.lookup("panel", name);
      if (panelFile.file) {
        const pr = checkPanelFile(reg, panelFile.file);
        env.out(`${panelFile.file.canonical} (panel): ${hasErrors(pr.diagnostics) ? "failed" : "ok"}`);
        return finish2([...ds, ...pr.diagnostics], env);
      }
    }
    printStatus(r, name);
    if (r.effective) ds.push(...staleRenderDiagnostics(generatedFileName(r.effective)));
    return finish2(ds, env);
  }
  const c = checkLibrary(reg, userOnlyReg);
  for (const u of c.units) ds.push(...u.diagnostics);
  if (c.personas.length === 0) env.out("no personas found");
  const personaKinds = scopeKindsByName(c.personas.map((p) => p.file));
  for (const { file, result } of c.personas) {
    printStatus(result, (personaKinds.get(file.name)?.size ?? 0) > 1 ? `${file.canonical} (${file.scope.kind})` : file.canonical);
  }
  const panelKinds = scopeKindsByName(c.panels.map((p) => p.file));
  for (const { file, diagnostics } of c.panels) {
    ds.push(...diagnostics);
    const label = (panelKinds.get(file.name)?.size ?? 0) > 1 ? `${file.canonical} (panel, ${file.scope.kind})` : `${file.canonical} (panel)`;
    env.out(`${label}: ${hasErrors(diagnostics) ? "failed" : "ok"}`);
  }
  ds.push(...staleRenderDiagnostics());
  return finish2(ds, env);
}
function explain(reg, base2, name, env) {
  const r = resolvePersona(reg, name);
  if (r.effective) {
    env.out(describeEffective(r.effective));
    env.out(`
== Clash report ==
${formatReport(r.report)}`);
    env.out(`
== Rendered prompt (swap) ==
${renderPrompt(r.effective, "swap")}`);
  }
  return finish2([...base2, ...r.diagnostics], env);
}
function render(reg, base2, targets, name, scope, dropped, env) {
  const r = resolvePersona(reg, name);
  const ds = [...base2, ...r.diagnostics.filter((d) => d.code !== "W_UNREVIEWED" && d.code !== "W_STALE_OVERRIDE")];
  if (!r.effective) return finish2(ds, env);
  const planned = planRender(r.effective, targets, scope);
  if (planned.plan?.scope === "project" && dropped) {
    ds.push(err(
      "E_RENDER_SCOPE",
      "the project scope was dropped because it is the same directory as the user scope; there is no project scope to render into",
      void 0,
      "Run from inside a project (a directory below a git root with its own .claude, distinct from the user scope)"
    ));
    return finish2(ds, env);
  }
  ds.push(...planned.diagnostics);
  if (planned.plan) {
    const written = writePlan(planned.plan);
    ds.push(...written);
    if (written.length === 0) {
      for (const f of planned.plan.files) env.out(`wrote ${f.path}`);
      env.out("Restart Claude Code to pick up a new or changed output style.");
    }
  }
  const line = activationLine(r.effective.canonical, r.report);
  if (line) env.out(line);
  return finish2(ds, env);
}
function list2(reg, warnings, kind, json, env) {
  const listing = listRows(reg);
  const kinds = kind ? [kind] : ["units", "personas", "panels"];
  if (json) {
    const out = {};
    for (const k of kinds) out[k] = listing[k];
    out.warnings = warnings.map(diagnosticJson);
    env.out(JSON.stringify(out, null, 2));
    return 0;
  }
  env.out(formatListing(listing, kinds, env.columns ?? 80));
  for (const d of warnings) (env.err ?? env.out)(formatDiagnostic(d));
  return 0;
}
var AUTHOR_COMMANDS = ["show", "save", "patch", "delete"];
var FILE_KINDS = ["unit", "persona", "panel"];
var ONLY = {
  file: "--file is only accepted by check-judgment, check-evidence, compare, gate, save and patch",
  expectHash: "--expect-hash is only accepted by save, patch and delete",
  force: "--force is only accepted by delete",
  panel: "--panel is only accepted by prompt",
  json: "--json is only accepted by list, lineup, runs list, compare, gate, show, save, patch and delete"
};
function parseArgv(argv2, baseCwd) {
  let cwd2 = baseCwd;
  let scope;
  let scopeSeen = false;
  let json = false;
  let panel = false;
  let file;
  let checks;
  let from;
  let fromGiven;
  let out;
  let expectHash;
  let force = false;
  let record = false;
  let model;
  const positional = [];
  for (let i = 0; i < argv2.length; i++) {
    const a = argv2[i];
    if (a === "-h" || a === "--help") return { kind: "help" };
    if (a === "--cwd") {
      const v = argv2[++i];
      if (!v) return { kind: "usage" };
      const next = resolve5(baseCwd, v);
      let isDir2;
      try {
        isDir2 = statSync6(next).isDirectory();
      } catch {
        isDir2 = false;
      }
      if (!isDir2) return { kind: "usage", message: `${next} is not a directory` };
      cwd2 = next;
    } else if (a === "--scope") {
      const v = argv2[++i];
      if (v !== "project" && v !== "user" && v !== "plugin") return { kind: "usage" };
      if (scopeSeen) return { kind: "usage", message: "--scope may be given only once" };
      scopeSeen = true;
      scope = v;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--panel") {
      panel = true;
    } else if (a === "--file") {
      const v = argv2[++i];
      if (!v) return { kind: "usage", message: "--file needs a path" };
      file = resolve5(baseCwd, v);
    } else if (a === "--expect-hash") {
      const v = argv2[++i];
      if (!v) return { kind: "usage", message: '--expect-hash needs a hash, or "none"' };
      expectHash = v;
    } else if (a === "--force") {
      force = true;
    } else if (a === "--record") {
      record = true;
    } else if (a === "--model") {
      const v = argv2[++i];
      if (!v || v.startsWith("-")) return { kind: "usage", message: "--model needs a model" };
      if (model !== void 0) return { kind: "usage", message: "--model may be given only once" };
      model = v;
    } else if (a === "--checks" || a === "--from" || a === "--out") {
      const v = argv2[++i];
      if (!v) return { kind: "usage", message: `${a} needs a path` };
      if (a === "--checks") checks = resolve5(baseCwd, v);
      else if (a === "--from") {
        from = resolve5(baseCwd, v);
        fromGiven = v;
      } else out = resolve5(baseCwd, v);
    } else if (a.startsWith("-")) {
      return { kind: "usage" };
    } else {
      positional.push(a);
    }
  }
  if (record && positional[0] !== "compare") return { kind: "usage", message: "--record is only accepted by compare" };
  if (model !== void 0 && positional[0] !== "lineup") return { kind: "usage", message: "--model is only accepted by lineup" };
  if (positional[0] === "lineup") {
    const names = positional.slice(1);
    if (scopeSeen || panel || file !== void 0 || expectHash !== void 0 || force || checks !== void 0 || from !== void 0 || out !== void 0) {
      return { kind: "usage", message: "lineup accepts only --cwd, --json and --model" };
    }
    if (!json) return { kind: "usage", message: "lineup needs --json" };
    if (names.length === 0) return { kind: "usage", message: "lineup needs a saved panel, or 2 to 6 personas" };
    return { kind: "lineup", cwd: cwd2, names, model };
  }
  if (positional[0] === "check-evidence") {
    if (positional.length > 1) return { kind: "usage", message: "check-evidence takes no name; pass the evidence with --file or on stdin" };
    if (scopeSeen || json || panel || expectHash !== void 0 || force || checks !== void 0 || from !== void 0 || out !== void 0) return { kind: "usage", message: "check-evidence accepts only --file" };
    return { kind: "evidence", file };
  }
  if (positional[0] === "runs") {
    const [, sub, ...extra] = positional;
    if (sub !== "new" && sub !== "list") return { kind: "usage", message: 'runs needs "new" or "list"' };
    if (extra.length > 0) return { kind: "usage", message: `runs ${sub} takes no other arguments` };
    if (scopeSeen || panel || file !== void 0 || expectHash !== void 0 || force || checks !== void 0 || from !== void 0 || out !== void 0 || json && sub === "new") {
      return { kind: "usage", message: sub === "new" ? "runs new accepts only --cwd" : "runs list accepts only --cwd and --json" };
    }
    return { kind: "runs", cwd: cwd2, command: sub, json };
  }
  if (AUTHOR_COMMANDS.includes(positional[0] ?? "")) {
    const [command2, kind, name2, ...extra] = positional;
    const cmd2 = command2;
    if (!kind || !name2 || extra.length > 0) return { kind: "usage", message: `${cmd2} needs <unit|persona|panel> <name>` };
    if (!FILE_KINDS.includes(kind)) return { kind: "usage", message: `kind must be unit, persona or panel, not "${kind}"` };
    const writes = cmd2 !== "show";
    const nameValid = writes ? KEBAB.test(name2) : REF.test(name2);
    if (!nameValid) {
      return { kind: "usage", message: writes ? `<name> must be kebab-case, not "${name2}"` : `<name> must be kebab-case, or <plugin>:kebab, not "${name2}"` };
    }
    if (writes && scope === void 0) return { kind: "usage", message: `${cmd2} needs --scope project|user` };
    if (writes && scope === "plugin") return { kind: "usage", message: "aska never writes into a plugin; use --scope project or user" };
    const takesFile = cmd2 === "save" || cmd2 === "patch";
    if (takesFile && file === void 0) return { kind: "usage", message: `${cmd2} needs --file <path>` };
    if (!takesFile && file !== void 0) return { kind: "usage", message: ONLY.file };
    if (!takesFile && cmd2 !== "delete" && expectHash !== void 0) return { kind: "usage", message: ONLY.expectHash };
    if (cmd2 === "delete" && expectHash === "none") return { kind: "usage", message: "delete takes the hash of the file it deletes, not --expect-hash none" };
    if (force && cmd2 !== "delete") return { kind: "usage", message: ONLY.force };
    if (panel) return { kind: "usage", message: ONLY.panel };
    if (checks !== void 0 || from !== void 0 || out !== void 0) return { kind: "usage", message: `--checks, --from and --out are not accepted by ${cmd2}` };
    return { kind: "author", cwd: cwd2, command: cmd2, fileKind: kind, name: name2, scope, json, file, expectHash, force };
  }
  if (expectHash !== void 0) return { kind: "usage", message: ONLY.expectHash };
  if (force) return { kind: "usage", message: ONLY.force };
  if (scope === "plugin") return { kind: "usage", message: "--scope plugin is only accepted by show" };
  const [command, name, ...rest] = positional;
  if (rest.length > 0) return { kind: "usage" };
  const COMMANDS = ["validate", "explain", "render", "list", "prompt", "check-judgment", "compare", "targets", "gate"];
  if (!COMMANDS.includes(command ?? "")) return { kind: "usage" };
  const cmd = command;
  if ((cmd === "explain" || cmd === "render" || cmd === "prompt" || cmd === "check-judgment") && !name) return { kind: "usage" };
  if (cmd === "compare" && name !== void 0) return { kind: "usage", message: "compare takes no name; pass the panel result with --file or on stdin" };
  if (record && file === void 0) return { kind: "usage", message: "--record needs --file <folder>/panel-result.json" };
  if (cmd === "targets" && name !== void 0) return { kind: "usage", message: "targets takes no name" };
  if ((from !== void 0 || out !== void 0) && cmd !== "targets") return { kind: "usage", message: "--from and --out are only accepted by targets" };
  if (cmd === "targets" && from === void 0) return { kind: "usage", message: "targets needs --from <file.md>" };
  if (cmd === "targets" && out !== void 0 && out === from) return { kind: "usage", message: "--out must not be the same file as --from" };
  if (checks !== void 0 && cmd !== "prompt" && cmd !== "check-judgment" && cmd !== "gate") return { kind: "usage", message: "--checks is only accepted by prompt, check-judgment and gate" };
  if (cmd === "gate" && (file === void 0 || checks === void 0)) return { kind: "usage", message: "gate needs --file <judgment.json> and --checks <targets.json>" };
  if (cmd !== "render" && scope !== void 0) return { kind: "usage", message: "--scope is only accepted by render" };
  if (panel && cmd !== "prompt") return { kind: "usage", message: ONLY.panel };
  if (cmd === "prompt" && !panel) return { kind: "usage", message: "prompt needs --panel" };
  if (file !== void 0 && cmd !== "check-judgment" && cmd !== "compare" && cmd !== "gate") return { kind: "usage", message: ONLY.file };
  if (json && cmd !== "list" && cmd !== "compare" && cmd !== "gate") return { kind: "usage", message: ONLY.json };
  if (cmd === "list") {
    if (name !== void 0 && name !== "units" && name !== "personas" && name !== "panels") {
      return { kind: "usage", message: `list takes "units", "personas" or "panels", not "${name}"` };
    }
    return { kind: "command", cwd: cwd2, command: cmd, name, json };
  }
  return { kind: "command", cwd: cwd2, command: cmd, name, scope, json, panel, file, record, checks, from, fromGiven, out };
}
function needsPluginData(p) {
  return p.kind === "command" && p.command !== "targets" || p.kind === "author" || p.kind === "lineup";
}
function run(argv2, env) {
  const parsed2 = parseArgv(argv2, env.cwd);
  if (parsed2.kind === "help") {
    env.out(USAGE);
    return 0;
  }
  if (parsed2.kind === "usage") {
    if (parsed2.message) env.out(parsed2.message);
    env.out(USAGE);
    return 2;
  }
  if (parsed2.kind === "runs") return runsCmd(parsed2, env);
  if (parsed2.kind === "evidence") return checkEvidenceCmd(parsed2.file, env);
  if (parsed2.kind === "command" && parsed2.command === "targets") return targetsCmd(parsed2.from, parsed2.fromGiven, parsed2.out, env);
  const d = discoverScopes({
    cwd: parsed2.cwd,
    home: env.home,
    pluginListJson: env.pluginListJson,
    pluginListUnavailableReason: env.pluginListUnavailableReason,
    selfPluginRoot: env.selfPluginRoot
  });
  if (parsed2.kind === "author") return authorCmd(d, parsed2, env);
  if (parsed2.kind === "lineup") {
    const lineupReg = new Registry(d.scopes);
    return lineupCmd(lineupReg, [...d.diagnostics, ...lineupReg.diagnostics], parsed2, env);
  }
  const { command, name, scope } = parsed2;
  const reg = new Registry(d.scopes);
  const dropped = d.project.droppedClaudeDir !== void 0;
  const targets = {
    projectClaudeDir: d.project.claudeDir ?? join7(d.project.base, ".claude"),
    userClaudeDir: join7(resolve5(env.home), ".claude")
  };
  if (command === "list") return list2(reg, [...d.diagnostics, ...reg.diagnostics], name, parsed2.json === true, env);
  if (command === "prompt") return promptCmd(reg, name, env, parsed2.checks);
  if (command === "check-judgment") return checkJudgmentCmd(reg, name, parsed2.file, env, parsed2.checks);
  if (command === "compare") {
    const input = readRequiredInput(parsed2.file, env);
    if ("code" in input) return input.code;
    const parsedResult = parsePanelResult(input.text);
    if (!parsedResult.result) {
      for (const d2 of parsedResult.diagnostics) env.out(formatDiagnostic(d2));
      return 1;
    }
    const comparison = comparePanel(parsedResult.result, (ref) => resolvePersona(reg, ref).effective);
    env.out(parsed2.json ? JSON.stringify(comparison, null, 2) : formatComparison(comparison));
    if (parsed2.record) {
      const warning = recordComparison(dirname5(parsed2.file), comparison, env.now?.() ?? /* @__PURE__ */ new Date());
      if (warning) (env.err ?? env.out)(`warning: ${warning}`);
    }
    return comparison.ok ? 0 : 1;
  }
  if (command === "validate") {
    const userOnlyReg = new Registry(d.scopes.filter((s) => s.kind !== "project"));
    return validate(reg, userOnlyReg, [...d.diagnostics, ...reg.diagnostics], targets, dropped, name, env);
  }
  if (command === "explain") return explain(reg, d.diagnostics, name, env);
  if (command === "gate") return gateCmd(reg, name ?? "gate", parsed2.file, parsed2.checks, parsed2.json === true, env);
  return render(reg, d.diagnostics, targets, name, scope, dropped, env);
}

// src/cli/bin.ts
var selfPluginRoot = resolve6(dirname6(fileURLToPath(import.meta.url)), "..", "..", "..");
function pluginList(cwd2) {
  const fromEnv = process.env.PERSONA_PLUGINS_JSON;
  if (fromEnv === void 0) return runPluginList(cwd2);
  try {
    return { json: readFileSync13(fromEnv, "utf8") };
  } catch {
    return { reason: `could not read "${fromEnv}"` };
  }
}
var argv = process.argv.slice(2);
var cwd = process.cwd();
var parsed = parseArgv(argv, cwd);
var needsPlugins = needsPluginData(parsed);
var pl = needsPlugins && "cwd" in parsed ? pluginList(parsed.cwd) : {};
process.exitCode = run(argv, {
  cwd,
  home: process.env.PERSONA_HOME ?? homedir(),
  runsEnv: process.env,
  pluginListJson: pl.json,
  pluginListUnavailableReason: pl.reason,
  selfPluginRoot,
  out: (line) => process.stdout.write(`${line}
`),
  columns: process.stdout.columns,
  err: (line) => process.stderr.write(`${line}
`),
  stdin: () => readFileSync13(0, "utf8"),
  // isatty(0) checks fd 0 directly, unlike process.stdin.isTTY, whose getter creates Node's
  // stdin stream and as a side effect sets O_NONBLOCK on a pipe or socket fd 0 — which then
  // makes the later readFileSync(0) throw EAGAIN on any writer slower than Node's startup.
  stdinIsTTY: isatty(0)
});
