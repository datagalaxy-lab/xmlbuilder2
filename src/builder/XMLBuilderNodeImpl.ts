import {
  XMLBuilderOptions, XMLBuilderNode, AttributesObject, ExpandObject,
  WriterOptions, XMLSerializedValue, Validator, DTDOptions,
  DefaultBuilderOptions,
  CastAsNode
} from "./interfaces"
import { dom, algorithm, util } from "@oozcitak/dom"
import {
  applyDefaults, isObject, isString, isFunction, isMap, isArray, isEmpty, 
  getValue, forEachObject, forEachArray
} from "@oozcitak/util"
import { namespace as infraNamespace } from "@oozcitak/infra"
import { 
  StringWriterImpl, MapWriterImpl, ObjectWriterImpl, JSONWriterImpl
} from "../writers"
import { CastAsNodeImpl } from "./CastAsNode"

/**
 * Represents a mixin that extends XML nodes to implement easy to use and
 * chainable document builder methods.
 */
export class XMLBuilderNodeImpl implements XMLBuilderNode {
  private static _algo = new algorithm.DOMAlgorithm()

  private _castAsNode: CastAsNode | undefined
  private _isRawNode: boolean = false

  /** @inheritdoc */
  get as(): CastAsNode {
    if (this._castAsNode === undefined) {
      this._castAsNode = new CastAsNodeImpl(this)
    }
    return this._castAsNode
  }

  /** @inheritdoc */
  set(options: Partial<XMLBuilderOptions>): XMLBuilderNode {
    this._options = applyDefaults(
      applyDefaults(this._options, options, true), // apply user settings
      DefaultBuilderOptions) // provide defaults
    return this
  }

  /** @inheritdoc */
  ele(p1: string | ExpandObject, p2?: AttributesObject | string,
    p3?: AttributesObject): XMLBuilderNode {

    let namespace: string | undefined
    let name: string | ExpandObject | undefined
    let attributes: AttributesObject | undefined

    if (isObject(p1)) {
      // ele(obj: ExpandObject)
      [namespace, name, attributes] = [undefined, p1, undefined]
    } else if (isString(p1) && isString(p2)) {
      // ele(namespace: string, name: string, attributes?: AttributesObject)
      [namespace, name, attributes] = [p1, p2, p3]
    } else if (isString(p1) && isObject(p2)) {
      // ele(name: string, attributes: AttributesObject)
      [namespace, name, attributes] = [undefined, p1, p2]
    } else if (isString(p1)) {
      // ele(name: string)
      [namespace, name, attributes] = [undefined, p1, undefined]
    }

    if (attributes) {
      attributes = getValue(attributes)
    }

    let lastChild: XMLBuilderNode | null = null

    if (isFunction(name)) {
      // evaluate if function
      lastChild = this.ele(name.apply(this))
    } else if (isArray(name)) {
      for (const item of forEachArray(name)) {
        lastChild = this.ele(item)
      }
    } else if (isMap(name) || isObject(name)) {
      // expand if object
      for (let [key, val] of forEachObject(name)) {
        if (isFunction(val)) {
          // evaluate if function
          val = val.apply(this)
        }

        if (!this._options.ignoreConverters && key.indexOf(this._options.convert.att) === 0) {
          // assign attributes
          if (key === this._options.convert.att) {
            lastChild = this.att(val)
          } else {
            lastChild = this.att(key.substr(this._options.convert.att.length), val)
          }
        } else if (!this._options.ignoreConverters && key.indexOf(this._options.convert.text) === 0) {
          // text node
          if (isObject(val) || isMap(val)) {
            // if the key is #text expand child nodes under this node to support mixed content
            lastChild = this.ele(val)
          } else {
            lastChild = this.txt(val)
          }
        } else if (!this._options.ignoreConverters && key.indexOf(this._options.convert.cdata) === 0) {
          // cdata node
          lastChild = this.dat(val)
        } else if (!this._options.ignoreConverters && key.indexOf(this._options.convert.comment) === 0) {
          // comment node
          lastChild = this.com(val)
        } else if (!this._options.ignoreConverters && key.indexOf(this._options.convert.raw) === 0) {
          // raw text node
          lastChild = this.raw(val)
        } else if (!this._options.ignoreConverters && key.indexOf(this._options.convert.ins) === 0) {
          // processing instruction
          const insIndex = val.indexOf(' ')
          const insTarget = (insIndex === -1 ? val : val.substr(0, insIndex))
          const insValue = (insIndex === -1 ? '' : val.substr(insIndex + 1))
          lastChild = this.ins(insTarget, insValue)
        } else if (isArray(val) && isEmpty(val)) {
          // skip empty arrays
          lastChild = this._dummy()
        } else if (isObject(val) && isEmpty(val)) {
          // empty objects produce one node
          lastChild = this.ele(key)
        } else if (!this._options.keepNullNodes && (val === null)) {
          // skip null and undefined nodes
          lastChild = this._dummy()
        } else if (isArray(val)) {
          // expand list by creating child nodes
          for (const item of forEachArray(val)) {
            const childNode: { [key: string]: any } = {}
            childNode[key] = item
            lastChild = this.ele(childNode)
          }
        } else if (isObject(val) || isMap(val)) {
          // check for a namespace declaration attribute
          const qName = XMLBuilderNodeImpl._algo.namespace.extractQName(key)
          for (const [attName, attValue] of forEachObject(val)) {
            if (attName[0] === this._options.convert.att) {
              const attQName = XMLBuilderNodeImpl._algo.namespace.extractQName(attName.slice(1))
              if ((attQName[0] === null && attQName[1] === "xmlns") ||
                (attQName[0] === "xmlns" && attQName[1] === qName[0])) {
                namespace = attValue
              }
            }
          }

          // create a parent node
          lastChild = this._node(namespace, key)

          // expand child nodes under parent
          lastChild.ele(val)
        } else if (val) {
          // leaf element node with a single text node
          lastChild = this.ele(key)
          lastChild.txt(val)
        } else {
          // leaf element node
          lastChild = this.ele(key)
        }
      }
    } else if (isString(name)) {
      // element node
      lastChild = this._node(namespace, name, attributes)
    }

    if (lastChild === null) {
      throw new Error("Could not create any elements with: " + (name || '').toString() + ". " + this._debugInfo())
    }

    return lastChild

  }

  /** @inheritdoc */
  remove(): XMLBuilderNode {
    const parent = this.up()
    this.as.any._remove()
    return parent
  }

  /** @inheritdoc */
  att(p1: AttributesObject | string, p2?: string | (() => string),
    p3?: string | (() => string)): XMLBuilderNode {

    if (isMap(p1) || isObject(p1)) {
      // att(obj: AttributesObject)
      if (p2 !== undefined) {
        throw new Error("Unexpected argument (expecting a single object argument). " + this._debugInfo())
      }
      // expand if object
      for (const [attName, attValue] of forEachObject(p1)) {
        this.att(attName, attValue)
      }
      return this
    }

    // get primitive values
    p1 = getValue(p1)
    if (p2 !== undefined) {
      p2 = getValue(p2)
    }
    if (p3 !== undefined) {
      p3 = getValue(p3)
    }

    // apply functions
    if (isFunction(p2)) {
      p2 = p2.apply(this)
    }
    if (isFunction(p3)) {
      p3 = p3.apply(this)
    }

    let namespace: string | null | undefined
    let name: string | undefined
    let value: string

    if (p1 !== undefined && p2 !== undefined && p3 !== undefined) {
      // att(namespace: string, name: string, value: string)
      [namespace, name, value] = [<string>p1, p2, p3]
    } else if (p1 !== undefined && p2 !== undefined) {
      // ele(name: string, value: string)
      [namespace, name, value] = [undefined, <string>p1, p2]
    } else {
      throw new Error("Attribute name and value not specified. " + this._debugInfo())
    }

    if (this._options.keepNullAttributes && (value === null)) {
      // keep null attributes
      value = ""
    } else if (value === null) {
      // skip null attributes
      return this
    }

    const ele = this.as.element
    // character validation
    name = this._validate.name(name, this._debugInfo())
    value = this._validate.attValue(value, this._debugInfo())

    // check if this is a namespace declaration attribute
    if (namespace === undefined) {
      const attQName = XMLBuilderNodeImpl._algo.namespace.extractQName(name)
      if (attQName[0] === "xmlns") {
        namespace = infraNamespace.XMLNS
      } else if (attQName[0] !== null) {
        namespace = ele.lookupNamespaceURI(attQName[0])
      } else if (this._options.inheritNS) {
        namespace = ele.lookupNamespaceURI(attQName[0])
      }
    }

    if (namespace !== null && namespace !== undefined && !ele.isDefaultNamespace(namespace)) {
      namespace = this._validate.namespace(namespace, this._debugInfo())
      ele.setAttributeNS(namespace, name, value)
    } else {
      ele.setAttribute(name, value)
    }

    return this
  }

  /** @inheritdoc */
  removeAtt(p1: string | string[], p2?: string | string[]): XMLBuilderNode {

    // get primitive values
    p1 = getValue(p1)
    if (p2 !== undefined) {
      p2 = getValue(p2)
    }

    if (isArray(p1) && p2 === undefined) {
      // removeAtt(names: string[])
      for (const attName of forEachArray(p1)) {
        this.removeAtt(attName)
      }
    } else if (isString(p1) && isArray(p2)) {
      // removeAtt(namespace: string, names: string[])
      for (const attName of forEachArray(p2)) {
        this.removeAtt(p1, attName)
      }
    } else if (isString(p1) && p2 === undefined) {
      // removeAtt(name: string)
      this.as.element.removeAttribute(p1)
    } else if (isString(p1) && isString(p2)) {
      // removeAtt(namespace: string, name: string)
      this.as.element.removeAttributeNS(p1, p2)
    } else {
      throw new TypeError("Invalid arguments. " + this._debugInfo())
    }

    return this
  }

  /** @inheritdoc */
  txt(content: string): XMLBuilderNode {
    // character validation
    content = this._validate.text(content, this._debugInfo())

    const child = this._doc.createTextNode(content)
    this.as.element.appendChild(child)

    return this
  }

  /** @inheritdoc */
  com(content: string): XMLBuilderNode {
    // character validation
    content = this._validate.comment(content, this._debugInfo())

    const child = this._doc.createComment(content)
    this.as.element.appendChild(child)

    return this
  }

  /** @inheritdoc */
  raw(content: string): XMLBuilderNode {
    // character validation
    content = this._validate.raw(content, this._debugInfo())

    const child = this._doc.createTextNode(content)
    const builder = XMLBuilderNodeImpl._FromNode(child) as XMLBuilderNodeImpl
    builder._isRawNode = true
    this.as.element.appendChild(child)

    return this
  }

  /** @inheritdoc */
  dat(content: string): XMLBuilderNode {
    // character validation
    content = this._validate.cdata(content, this._debugInfo())

    const child = this._doc.createCDATASection(content)
    this.as.element.appendChild(child)

    return this
  }

  /** @inheritdoc */
  ins(target: string, content: string = ''): XMLBuilderNode {
    // character validation
    target = this._validate.insTarget(target, this._debugInfo())
    content = this._validate.insValue(content, this._debugInfo())

    const child = this._doc.createProcessingInstruction(target, content)
    this.as.element.appendChild(child)

    return this
  }

  /** @inheritdoc */
  dec(options: { version: "1.0" | "1.1", encoding?: string, standalone?: boolean }): XMLBuilderNode {
    this._options.version = options.version
    this._options.encoding = options.encoding
    this._options.standalone = options.standalone

    return this
  }

  /** @inheritdoc */
  dtd(options?: DTDOptions): XMLBuilderNode {
    // character validation
    const pubID = this._validate.pubID((options && options.pubID) || '', this._debugInfo())
    const sysID = this._validate.sysID((options && options.sysID) || '', this._debugInfo())

    // create doctype node
    const docType = this._doc.implementation.createDocumentType(
      this._doc.documentElement !== null ? this._doc.documentElement.tagName : 'ROOT',
      pubID, sysID)

    if (this._doc.doctype !== null) {
      // replace existing doctype
      this._doc.replaceChild(docType, this._doc.doctype)
    } else {
      // insert before document element node or append to end
      this._doc.insertBefore(docType, this._doc.documentElement)
    }

    return this
  }

  /** @inheritdoc */
  import(node: XMLBuilderNode): XMLBuilderNode {
    const hostNode = this.as.node
    const hostDoc = hostNode.ownerDocument
    if (hostDoc === null) {
      throw new Error("Owner document is null. " + this._debugInfo())
    }

    const importedNode = node.as.node

    if (util.Guard.isDocumentNode(importedNode)) {
      // import document node
      const elementNode = importedNode.documentElement
      if (elementNode === null) {
        throw new Error("Imported document has no document node. " + this._debugInfo())
      }
      const clone = hostDoc.importNode(elementNode, true)
      hostNode.appendChild(clone)
    } else if (util.Guard.isDocumentFragmentNode(importedNode)) {
      // import child nodes
      for (const childNode of importedNode.childNodes) {
        const clone = hostDoc.importNode(childNode, true)
        hostNode.appendChild(clone)
      }
    } else {
      // import node
      const clone = hostDoc.importNode(importedNode, true)
      hostNode.appendChild(clone)
    }

    return this
  }

  /** @inheritdoc */
  doc(): XMLBuilderNode {
    return XMLBuilderNodeImpl._FromNode(this._doc)
  }

  /** @inheritdoc */
  root(): XMLBuilderNode {
    const ele = this._doc.documentElement
    if (!ele) {
      throw new Error("Document root element is null. " + this._debugInfo())
    }
    return XMLBuilderNodeImpl._FromNode(ele)
  }

  /** @inheritdoc */
  up(): XMLBuilderNode {
    const parent = this.as.node.parentNode
    if (!parent) {
      throw new Error("Parent node is null. " + this._debugInfo())
    }
    return XMLBuilderNodeImpl._FromNode(parent)
  }

  /** @inheritdoc */
  prev(): XMLBuilderNode {
    const node = this.as.node.previousSibling
    if (!node) {
      throw new Error("Previous sibling node is null. " + this._debugInfo())
    }
    return XMLBuilderNodeImpl._FromNode(node)
  }

  /** @inheritdoc */
  next(): XMLBuilderNode {
    const node = this.as.node.nextSibling
    if (!node) {
      throw new Error("Next sibling node is null. " + this._debugInfo())
    }
    return XMLBuilderNodeImpl._FromNode(node)
  }

  /** @inheritdoc */
  first(): XMLBuilderNode {
    const node = this.as.node.firstChild
    if (!node) {
      throw new Error("First child node is null. " + this._debugInfo())
    }
    return XMLBuilderNodeImpl._FromNode(node)
  }

  /** @inheritdoc */
  last(): XMLBuilderNode {
    const node = this.as.node.lastChild
    if (!node) {
      throw new Error("Last child node is null. " + this._debugInfo())
    }
    return XMLBuilderNodeImpl._FromNode(node)
  }

  /** @inheritdoc */
  toString(writerOptions?: WriterOptions): string {
    writerOptions = writerOptions || {}
    if (writerOptions.format === undefined) {
      writerOptions.format = "text"
    }

    return <string>this._serialize(writerOptions)
  }

  /** @inheritdoc */
  toObject(writerOptions?: WriterOptions): XMLSerializedValue {
    writerOptions = writerOptions || {}
    if (writerOptions.format === undefined) {
      writerOptions.format = "map"
    }

    return this._serialize(writerOptions)
  }

  /** @inheritdoc */
  end(writerOptions?: WriterOptions): XMLSerializedValue {
    writerOptions = writerOptions || {}
    if (writerOptions.format === undefined) {
      writerOptions.format = "text"
    }

    return (<XMLBuilderNodeImpl>this.doc())._serialize(writerOptions)
  }

  /**
   * Converts the node into its string or object representation.
   * 
   * @param options - serialization options
   */
  private _serialize(writerOptions: WriterOptions): XMLSerializedValue {
    if (writerOptions.format === "text") {
      const writer = new StringWriterImpl(this._options)
      return writer.serialize(this.as.node, writerOptions)
    } else if (writerOptions.format === "map") {
      const writer = new MapWriterImpl(this._options)
      return writer.serialize(this.as.node, writerOptions)
    } else if (writerOptions.format === "object") {
      const writer = new ObjectWriterImpl(this._options)
      return writer.serialize(this.as.node, writerOptions)
    } else if (writerOptions.format === "json") {
      const writer = new JSONWriterImpl(this._options)
      return writer.serialize(this.as.node, writerOptions)
    } else {
      return ''
    }
  }

  /**
   * Creates a new element node and appends it to the list of child nodes.
   * 
   * @param name - element name
   * @param attributes - a JS object with element attributes
   * @param text - contents of a text child node
   *  
   * @returns the new element node
   */
  private _node(namespace: string | null | undefined, name: string,
    attributes?: AttributesObject): XMLBuilderNode {

    // inherit namespace from parent
    if (namespace === null || namespace === undefined) {
      const qName = XMLBuilderNodeImpl._algo.namespace.extractQName(name)
      if (this._options.inheritNS) {
        const parent = this.as.node.parentNode
        if (parent) {
          namespace = parent.lookupNamespaceURI(qName[0])
        }
      }

      // override namespace if there is a namespace declaration
      // attribute
      if (attributes !== undefined) {
        for (let [attName, attValue] of forEachObject(attributes)) {
          if (attName === "xmlns") {
            namespace = attValue
          } else {
            const attQName = XMLBuilderNodeImpl._algo.namespace.extractQName(attName)
            if (attQName[0] === "xmlns" && attQName[1] === qName[0]) {
              namespace = attValue
            }
          }
        }
      }
    }

    const node = this.as.node

    // character validation
    this._validate.name(name, this._debugInfo())

    const child = (namespace !== null && namespace !== undefined ?
      this._doc.createElementNS(namespace, name) :
      this._doc.createElement(name)
    )

    node.appendChild(child)
    const builder = XMLBuilderNodeImpl._FromNode(child)

    // update doctype node if the new node is the document element node
    const oldDocType = this._doc.doctype
    if (child === this._doc.documentElement && oldDocType !== null) {
      const docType = this._doc.implementation.createDocumentType(
        this._doc.documentElement.tagName,
        oldDocType.publicId, oldDocType.systemId)
      this._doc.replaceChild(docType, oldDocType)
    }

    // create attributes
    if (attributes && !isEmpty(attributes)) {
      builder.att(attributes)
    }

    return builder
  }

  /**
   * Creates a dummy element node without adding it to the list of child nodes.
   * 
   * Dummy nodes are special nodes representing a node with a `null` value. 
   * Dummy nodes are created while recursively building the XML tree. Simply
   * skipping `null` values doesn't work because that would break the recursive
   * chain.
   * 
   * @returns the new dummy element node
   */
  private _dummy(): XMLBuilderNode {
    const child = this._doc.createElement('dummy_node')
    return XMLBuilderNodeImpl._FromNode(child)
  }

  /**
   * Returns the document owning this node.
   */
  protected get _doc(): dom.Interfaces.Document {
    const node = this.as.node
    if (util.Guard.isDocumentNode(node)) {
      return node
    }
    const doc = node.ownerDocument
    if (!doc) {
      throw new Error("Document is null. " + this._debugInfo())
    }
    return doc
  }

  /**
   * Converts a DOM node to an `XMLBuilder`.
   */
  static _FromNode(node: dom.Interfaces.Node): XMLBuilderNode {
    return node as unknown as XMLBuilderNode
  }

  /**
   * Returns debug information for this node.
   * 
   * @param name - node name
   */
  protected _debugInfo(name?: string): string {
    const node = this.as.node
    const parentNode = this.as.node.parentNode

    name = name || node.nodeName
    const parentName = parentNode ? parentNode.nodeName : ''

    if (!name && !parentName) {
      return ""
    } else if (!name) {
      return "parent: <" + parentName + ">"
    } else if (!parentName) {
      return "node: <" + name + ">"
    } else {
      return "node: <" + name + ">, parent: <" + parentName + ">"
    }
  }

  /**
   * Gets or sets builder options.
   */
  protected get _options(): XMLBuilderOptions {
    return this.doc().as.any._builderOptions
  }
  protected set _options(value: XMLBuilderOptions) {
    this.doc().as.any._builderOptions = value
  }

  /**
   * Gets or sets validator functions.
   */
  protected get _validate(): Validator {
    return this.doc().as.any._validator
  }
  protected set _validate(value: Validator) {
    this.doc().as.any._validator = value
  }

}