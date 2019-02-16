import { NodeType } from "./NodeType"
import { Node } from "./Node"
import { Element } from "./Element"
import { DOMImplementation } from "./DOMImplementation"
import { DocType } from "./DocType"
import { DOMError } from "./DOMError"
import { ElementCollection } from "./ElementCollection"
import { Utility } from "./Utility"
import { XMLSpec10 } from "./XMLSpec10"
import { Namespace } from "./Namespace"
import { DocumentFragment } from "./DocumentFragment"
import { Text } from "./Text"
import { Comment } from "./Comment"
import { ProcessingInstruction } from "./ProcessingInstruction"
import { NodeFilter } from "./NodeFilter"

/**
 * Represents a document node.
 */
export class Document extends Node {

  protected _nodeType: NodeType
  protected _nodeName: string

  URL: string | undefined
  documentURI: string | undefined
  origin: string | undefined
  compatMode: string | undefined
  characterSet: string | undefined
  contentType: string | undefined

  /**
   * Initializes a new instance of `Document`.
   */
  public constructor () 
  {
    super()

    this._nodeType = NodeType.Document
    this._nodeName = '#document'
  }

  /** 
   * Returns the {@link DOMImplementation} object that is associated 
   * with the document.
   */
  get implementation (): DOMImplementation 
  {
     return new DOMImplementation() 
  }

  /** 
   * Returns the {@link DocType} or `null` if there is none.
   */
  get doctype (): DocType | null
  {
    for (let child of this.childNodes) {
      if (child.nodeType === NodeType.DocType)
        return <DocType>child
    }
    return null
  }

  /** 
   * Returns the document element or `null` if there is none.
   */
  get documentElement (): Element | null
  {
    for (let child of this.childNodes) {
      if (child.nodeType === NodeType.Element)
        return <Element>child
    }
    return null
  }

  /**
   * Returns a {@link ElementCollection} of all descendant elements 
   * whose local name is `localName`.
   * 
   * @param localName - the local name to match or `*` to match all
   * descendant elements.
   * 
   * @returns an {@link ElementCollection} of matching descendant
   * elements
   */
  getElementsByTagName (localName: string): ElementCollection {
    let matchAll = (localName == '*')

    let list = new ElementCollection()

    if (this.documentElement) {
      Utility.forEachDescendant (this.documentElement, function(node: Node) {
        if (node.nodeType === NodeType.Element) {
          let ele = <Element>node
          if (matchAll || ele.localName === localName)
            list.push(ele)
        }
      })
    }

    return list
  }

  /**
   * Returns a {@link ElementCollection} of all descendant elements 
   * whose namespace is `namespace` and local name is `localName`.
   * 
   * @param namespace - the namespace to match or `*` to match any
   * namespace.
   * @param localName - the local name to match or `*` to match any
   * local name.
   * 
   * @returns an {@link ElementCollection} of matching descendant
   * elements
   */
  getElementsByTagNameNS (namespace: string, localName: string): ElementCollection {
    let matchAllNamespace = (namespace == '*')
    let matchAllLocalName = (localName == '*')

    let list = new ElementCollection()

    if (this.documentElement) {
      Utility.forEachDescendant (this.documentElement, function(node: Node) {
        if (node.nodeType === NodeType.Element) {
          let ele = <Element>node
          if ((matchAllLocalName || ele.localName === localName) &&
              (matchAllNamespace || ele.namespaceURI === namespace))
            list.push(ele)
        }
      })
    }

    return list
  }

  /**
   * Returns a {@link ElementCollection} of all descendant elements 
   * whose classes are contained in the list of classes given in 
   * `classNames`.
   * 
   * This method is not supported by this module and will throw an
   * exception.
   * 
   * @param classNames - a space-separated list of classes
   * 
   * @returns an {@link ElementCollection} of matching descendant
   * elements
   */
  getElementsByClassName (classNames: string): never {
    throw DOMError.NotSupportedError
  }

  /**
   * Returns a new {@link Element} with the given `localName`.
   * 
   * @param localName - the local name
   * 
   * @returns the new {@link Element}
   */
  createElement(localName: string): Element {
    return new Element(this, '', '', localName)
  }

  /**
   * Returns a new {@link Element} with the given `localName`.
   * 
   * @param localName - the local name
   * 
   * @returns the new {@link Element}
   */
  createElementNS(namespace: string | null, qualifiedName: string): Element {
    if (!qualifiedName.match(XMLSpec10.Name))
      throw DOMError.InvalidCharacterError
    if (!qualifiedName.match(XMLSpec10.QName))
      throw DOMError.NamespaceError
    
    let parts = qualifiedName.split(':')
    let prefix = (parts.length === 2 ? parts[0] : null)
    let localName = (parts.length === 2 ? parts[1] : qualifiedName)

    if(prefix && !namespace)
      throw DOMError.NamespaceError

    if(prefix === "xml" && namespace !== Namespace.XML)
      throw DOMError.NamespaceError

    if(namespace === Namespace.XMLNS && 
      (prefix !== "xmlns" || qualifiedName !== "xmlns"))
      throw DOMError.NamespaceError

    return new Element(this, namespace, prefix || '', localName)
  }

  /**
   * Returns a new {@link DocumentFragment}.
   * 
   * @returns the new {@link DocumentFragment}
   */
  createDocumentFragment(): DocumentFragment {
    return new DocumentFragment(this)
  }

  /**
   * Returns a new {@link Text} with the given `data`.
   * 
   * @param data - text content
   * 
   * @returns the new {@link Text}
   */
  createTextNode(data: string): Text
  {
    return new Text(this, data)
  }

  /**
   * Returns a new {@link Comment} with the given `data`.
   * 
   * @param data - text content
   * 
   * @returns the new {@link Comment}
   */
  createComment(data: string): Comment
  {
    return new Comment(this, data)
  }

  /**
   * Returns a new {@link ProcessingInstruction} with the given `target`
   * and `data`.
   * 
   * @param target - instruction target
   * @param data - text content
   * 
   * @returns the new {@link ProcessingInstruction}
   */
  createProcessingInstruction(target: string, data: string): ProcessingInstruction
  {
    if (!target.match(XMLSpec10.Name))
      throw DOMError.InvalidCharacterError
    if (!data.includes("?>"))
      throw DOMError.InvalidCharacterError

    return new ProcessingInstruction(this, target, data)
  }

  /**
   * Returns a copy of `node`.
   * 
   * @param deep - true to includes descendant nodes.
   * 
   * @returns the clone
   */
  importNode(node: Node, deep: boolean = false): Node {
    if(node.nodeType === NodeType.Document)
      throw DOMError.NotSupportedError

    return node.cloneNode(this, deep)
  }
  
  /**
   * Moves `node` from another document and returns it.
   * 
   * @param node - node to move.
   * 
   * @returns the adopted node
   */
  adoptNode(node: Node): Node {
    if(node.nodeType === NodeType.Document)
      throw DOMError.NotSupportedError

    let oldDocument = node.ownerDocument

    if(node.parentNode)
      node.parentNode.removeChild(node)

    node.ownerDocument = this
    Utility.forEachDescendant(node, 
      (child) => child.ownerDocument = this)

    return node
  }

  /**
   * Creates an event of the type specified.
   * 
   * This method is not supported by this module and will throw an
   * exception.
   * 
   * @param type - a string representing the type of event to be created
   */
  createEvent(type: any): never {
    throw DOMError.NotSupportedError
  }

  /**
   * Creates a new Range object.
   * 
   * This method is not supported by this module and will throw an
   * exception.
   */
  createRange(): never {
    throw DOMError.NotSupportedError
  }

  /**
   * Creates a new NodeIterator object.
   * 
   * This method is not supported by this module and will throw an
   * exception.
   */
  createNodeIterator(root: Node, whatToShow: number = NodeFilter.ShowAll,
    filter: NodeFilter | null = null): never {
      throw DOMError.NotSupportedError
  }

  /**
   * Creates a new TreeWalker object.
   * 
   * This method is not supported by this module and will throw an
   * exception.
   */
  createTreeWalker(root: Node, whatToShow: number = NodeFilter.ShowAll,
    filter: NodeFilter | null = null): never {
      throw DOMError.NotSupportedError
  }
}