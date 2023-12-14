import ScrollPage from "@muya/block";
import TreeNode from "@muya/block/base/treeNode";
import { BACK_HASH, BRACKET_HASH, EVENT_KEYS, isFirefox } from "@muya/config";
import Muya from "@muya/index";
import { Highlight } from "@muya/inlineRenderer/types";
import Selection from "@muya/selection";
import { Cursor, NodeOffset } from "@muya/selection/types";
import {
  adjustOffset,
  diffToTextOp,
  isInputEvent,
  isKeyboardEvent,
} from "@muya/utils";
import diff from "fast-diff";

// import logger from '@muya/utils/logger'

// const debug = logger('block.content:')

class Content extends TreeNode {
  public _text: string;
  public isComposed: boolean;

  static blockName = "content";

  get hasSelection() {
    return !!this.getCursor();
  }

  get selection() {
    return this.muya.editor.selection;
  }

  get inlineRenderer() {
    return this.muya.editor.inlineRenderer;
  }

  get path() {
    const { path: pPath } = this.parent!;

    return [...pPath, "text"];
  }

  get text() {
    return this._text;
  }

  set text(text) {
    const oldText = this._text;
    this._text = text;
    const { path } = this;
    if (this.blockName === "language-input") {
      path.pop();
      path.push("meta", "lang");
    }

    // dispatch change to modify json state
    if (oldText !== text) {
      const diffs = diff(oldText, text);
      this.jsonState.pushOperation(
        "editOp",
        path,
        "text-unicode",
        diffToTextOp(diffs)
      );
    }
  }

  get isCollapsed() {
    const { isCollapsed } = this.getCursor() ?? {};

    return isCollapsed;
  }

  get isContainerBlock() {
    return false;
  }

  constructor(muya: Muya, text: string) {
    super(muya);
    this.tagName = "span";
    this.classList = ["mu-content"];
    this.attributes = {
      contenteditable: true,
    };
    this._text = text;
    this.isComposed = false;
  }

  getAnchor(): void {
    // Do nothing.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clickHandler(_event: Event): void {
    // Do nothing.
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tabHandler(_event: Event): void {
    // Do nothing.
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  keyupHandler(_event: Event): void {
    // Do nothing.
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  inputHandler(_event: Event): void {
    // Do nothing.
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  backspaceHandler(_event: Event): void {
    // Do nothing.
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  enterHandler(_event: Event): void {
    // Do nothing.
  }

  /**
   * check this is a Content block?
   * @param this
   * @returns boolean
   */
  isContent() {
    return true;
  }

  /**
   * check this is a Parent block?
   * @param this
   * @returns boolean
   */
  isParent() {
    return false;
  }

  deleteHandler(event: Event): void {
    const { start, end } = this.getCursor()!;
    const { text } = this;
    // Only `languageInputContent` and `codeBlockContent` will call this method.
    if (start.offset === end.offset && start.offset === text.length) {
      event.preventDefault();
      return;
    }
  }

  arrowHandler(event: Event) {
    if (!isKeyboardEvent(event)) {
      return;
    }
    const previousContentBlock = this.previousContentInContext();
    const nextContentBlock = this.nextContentInContext();
    const { start, end } = this.getCursor()!;
    const { topOffset, bottomOffset } = Selection.getCursorYOffset(
      this.domNode!
    );

    // Just do nothing if the cursor is not collapsed or `shiftKey` pressed
    if (start.offset !== end.offset || event.shiftKey) {
      return;
    }

    if (
      (event.key === EVENT_KEYS.ArrowUp && topOffset > 0) ||
      (event.key === EVENT_KEYS.ArrowDown && bottomOffset > 0)
    ) {
      return;
    }

    const { muya } = this;
    let cursorBlock = null;
    let offset = 0;

    if (
      event.key === EVENT_KEYS.ArrowUp ||
      (event.key === EVENT_KEYS.ArrowLeft && start.offset === 0)
    ) {
      event.preventDefault();
      event.stopPropagation();

      if (!previousContentBlock) {
        return;
      }
      cursorBlock = previousContentBlock;
      offset = previousContentBlock.text.length;
    } else if (
      event.key === EVENT_KEYS.ArrowDown ||
      (event.key === EVENT_KEYS.ArrowRight && start.offset === this.text.length)
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (nextContentBlock) {
        cursorBlock = nextContentBlock;
      } else {
        const newNodeState = {
          name: "paragraph",
          text: "",
        };
        const newNode = ScrollPage.loadBlock(newNodeState.name).create(
          muya,
          newNodeState
        );
        this.scrollPage?.append(newNode, "user");
        cursorBlock = newNode.children.head;
      }
      offset = adjustOffset(0, cursorBlock, event);
    }

    if (cursorBlock) {
      this.update();
      cursorBlock.setCursor(offset, offset, true);
    }
  }

  createDomNode() {
    super.createDomNode();
    this.update();
  }

  /**
   * Get cursor if selection is in this block.
   */
  getCursor() {
    const selection = this.selection.getSelection();
    if (selection == null) {
      return null;
    }

    const {
      anchor,
      focus,
      anchorBlock,
      focusBlock,
      isCollapsed,
      isSelectionInSameBlock, // This is always be true.
      direction,
      type,
    } = selection;

    if (anchorBlock !== this || focusBlock !== this) {
      return null;
    }

    return {
      start: { offset: Math.min(anchor.offset, focus.offset) },
      end: { offset: Math.max(anchor.offset, focus.offset) },
      anchor,
      focus,
      isCollapsed,
      isSelectionInSameBlock,
      direction,
      type,
    };
  }

  /**
   * Set cursor at the special position
   * @param {number} begin
   * @param {number} end
   * @param {boolean} needUpdate
   */
  setCursor(begin: number, end: number, needUpdate = false) {
    const cursor = {
      anchor: { offset: begin },
      focus: { offset: end },
      block: this,
      path: this.path,
    };

    if (needUpdate) {
      this.update(cursor);
    }

    this.muya.editor.activeContentBlock = this;

    this.selection.setSelection(cursor);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(_cursor?: Cursor, _highlights: Highlight[] = []) {
    const { text } = this;
    this.domNode!.innerHTML = `<span class="mu-syntax-text">${text}</span>`;
  }

  composeHandler(event: Event) {
    if (event.type === "compositionstart") {
      this.isComposed = true;
    } else if (event.type === "compositionend") {
      this.isComposed = false;
      // Because the compose event will not cause `input` event, So need call `inputHandler` by ourself
      this.inputHandler(event);
    }
  }

  /**
   * used in input handler
   * @param {input event} event
   */
  autoPair(
    event: Event,
    text: string,
    start: NodeOffset,
    end: NodeOffset,
    isInInlineMath = false,
    isInInlineCode = false,
    type = "format"
  ) {
    // TODO: @JOCS, remove use this selection directly.
    const { anchor, focus } = this.selection;
    const oldStart = anchor!.offset <= focus!.offset ? anchor : focus;
    let needRender = false;

    // The event will not be input event, when click task list item input element.
    if (!isInputEvent(event) || !oldStart) {
      return { text, needRender };
    }

    if (this.text !== text) {
      if (start.offset === end.offset && event.type === "input") {
        const { offset } = start;
        const { autoPairBracket, autoPairMarkdownSyntax, autoPairQuote } =
          this.muya.options;
        const inputChar = text.charAt(+offset - 1);
        const preInputChar = text.charAt(+offset - 2);
        const prePreInputChar = text.charAt(+offset - 3);
        const postInputChar = text.charAt(+offset);

        if (/^delete/.test(event.inputType)) {
          // handle `deleteContentBackward` or `deleteContentForward`
          const deletedChar = this.text[offset];
          if (
            event.inputType === "deleteContentBackward" &&
            postInputChar === BRACKET_HASH[deletedChar]
          ) {
            needRender = true;
            text = text.substring(0, offset) + text.substring(offset + 1);
          }

          if (
            event.inputType === "deleteContentForward" &&
            inputChar === BACK_HASH[deletedChar]
          ) {
            needRender = true;
            start.offset -= 1;
            end.offset -= 1;
            text = text.substring(0, offset - 1) + text.substring(offset);
          }
        } else if (
          event.inputType.indexOf("delete") === -1 &&
          inputChar === postInputChar &&
          ((autoPairQuote && /[']{1}/.test(inputChar)) ||
            (autoPairQuote && /["]{1}/.test(inputChar)) ||
            (autoPairBracket && /[}\])]{1}/.test(inputChar)) ||
            (autoPairMarkdownSyntax && /[$]{1}/.test(inputChar)) ||
            (autoPairMarkdownSyntax &&
              /[*$`~_]{1}/.test(inputChar) &&
              /[_*~]{1}/.test(prePreInputChar)))
        ) {
          needRender = true;
          text = text.substring(0, offset) + text.substring(offset + 1);
        } else {
          // Not Unicode aware, since things like \p{Alphabetic} or \p{L} are not supported yet

          if (
            !/\\/.test(preInputChar) &&
            ((autoPairQuote &&
              /[']{1}/.test(inputChar) &&
              !/[a-zA-Z\d]{1}/.test(preInputChar)) ||
              (autoPairQuote && /["]{1}/.test(inputChar)) ||
              (autoPairBracket && /[{[(]{1}/.test(inputChar)) ||
              (type === "format" &&
                !isInInlineMath &&
                !isInInlineCode &&
                autoPairMarkdownSyntax &&
                !/[a-z0-9]{1}/i.test(preInputChar) &&
                /[*$`~_]{1}/.test(inputChar)))
          ) {
            needRender = true;
            text =
              typeof event.data === "string" && BRACKET_HASH[event.data]
                ? text.substring(0, offset) +
                  BRACKET_HASH[inputChar] +
                  text.substring(offset)
                : text;
          }

          // Delete the last `*` of `**` when you insert one space between `**` to create a bullet list.
          if (
            type === "format" &&
            typeof event.data === "string" &&
            /\s/.test(event.data) &&
            /^\* /.test(text) &&
            preInputChar === "*" &&
            postInputChar === "*"
          ) {
            text = text.substring(0, offset) + text.substring(offset + 1);
            needRender = true;
          }
        }
      }

      // Just work for `Shift + Enter` to create a soft and hard line break.
      if (
        this.text.endsWith("\n") &&
        start.offset === text.length &&
        (event.inputType === "insertText" || event.type === "compositionend")
      ) {
        text = this.text + event.data;
        // I don't know why firefox don't need to offset++
        // For more info: https://github.com/marktext/muya/issues/130
        if (!isFirefox) {
          start.offset++;
          end.offset++;
        }
      } else if (
        this.text.length === oldStart.offset &&
        this.text[oldStart.offset - 2] === "\n" &&
        event.inputType === "deleteContentBackward"
      ) {
        text = this.text.substring(0, oldStart.offset - 1);
        start.offset = text.length;
        end.offset = text.length;
      }
    }

    return { text, needRender };
  }

  insertTab() {
    const { muya, text } = this;
    const { tabSize } = muya.options;
    const tabCharacter = String.fromCharCode(160).repeat(tabSize);
    const { start, end } = this.getCursor()!;

    if (this.isCollapsed) {
      this.text =
        text.substring(0, start.offset) +
        tabCharacter +
        text.substring(end.offset);
      const offset = start.offset + tabCharacter.length;

      this.setCursor(offset, offset, true);
    }
  }

  keydownHandler = (event: Event) => {
    if (!isKeyboardEvent(event)) {
      return;
    }
    // TODO: move codes bellow to muya.ui ?
    if (
      this.muya.ui.shownFloat.size > 0 &&
      (event.key === EVENT_KEYS.Enter ||
        event.key === EVENT_KEYS.Escape ||
        event.key === EVENT_KEYS.Tab ||
        event.key === EVENT_KEYS.ArrowUp ||
        event.key === EVENT_KEYS.ArrowDown)
    ) {
      let needPreventDefault = false;

      for (const tool of this.muya.ui.shownFloat) {
        if (
          tool.name === "mu-format-picker" ||
          tool.name === "mu-table-picker" ||
          tool.name === "mu-quick-insert" ||
          tool.name === "mu-emoji-picker" ||
          tool.name === "mu-front-menu" ||
          tool.name === "mu-list-picker" ||
          tool.name === "mu-image-selector" ||
          tool.name === "mu-table-column-tools" ||
          tool.name === "mu-table-bar-tools"
        ) {
          needPreventDefault = true;
          break;
        }
      }

      if (needPreventDefault) {
        event.preventDefault();
      }

      return;
    }

    switch (event.key) {
      case EVENT_KEYS.Backspace:
        this.backspaceHandler(event);
        break;

      case EVENT_KEYS.Delete:
        this.deleteHandler(event);
        break;

      case EVENT_KEYS.Enter:
        if (!this.isComposed) {
          this.enterHandler(event);
        }
        break;

      case EVENT_KEYS.ArrowUp: // fallthrough

      case EVENT_KEYS.ArrowDown: // fallthrough

      case EVENT_KEYS.ArrowLeft: // fallthrough

      case EVENT_KEYS.ArrowRight: // fallthrough
        if (!this.isComposed) {
          this.arrowHandler(event);
        }
        break;

      case EVENT_KEYS.Tab:
        this.tabHandler(event);
        break;
      default:
        break;
    }
  };

  blurHandler() {
    this.scrollPage?.handleBlurFromContent(this);
  }

  focusHandler() {
    this.scrollPage?.handleFocusFromContent(this);
  }

  getAncestors() {
    const ancestors = [];
    let block = this.parent;

    while (block && block.isParent && block.isParent()) {
      ancestors.push(block);
      block = block.parent;
    }

    return ancestors;
  }

  getCommonAncestors(block: Content) {
    const myAncestors = this.getAncestors();
    const blockAncestors = block.getAncestors();

    const commonAncestors = [];

    for (const a of myAncestors) {
      if (blockAncestors.includes(a)) {
        commonAncestors.push(a);
      }
    }

    return commonAncestors;
  }

  remove() {
    super.remove();

    return this;
  }
}

export default Content;