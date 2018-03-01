/**
 * @author Adam (charrondev) Charron <adam.c@vanillaforums.com>
 * @copyright 2009-2018 Vanilla Forums Inc.
 * @license https://opensource.org/licenses/GPL-2.0 GPL-2.0
 */

// Quill
import Theme from "quill/core/theme";
import Keyboard from "quill/modules/keyboard";
import Delta from "quill-delta";
import Emitter from "quill/core/emitter";
import WrapperBlot, { LineBlot } from "./blots/abstract/WrapperBlot";
import CodeBlockBlot from "./blots/CodeBlockBlot";
import { closeEditorFlyouts } from "./quill-utilities";
import Parchment from "parchment";
// React
import React from "react";
import ReactDOM from "react-dom";
import InlineEditorToolbar from "./components/InlineEditorToolbar";
import ParagraphEditorToolbar from "./components/ParagraphEditorToolbar";
import EditorEmojiPicker from "./components/EditorEmojiPicker";

export default class VanillaTheme extends Theme {

    static MULTI_LINE_BLOTS = ['spoiler-line', 'blockquote-line', 'code-block'];

    static CLEAR_MULTI_LINE_BLOTS = { 'spoiler-line': false, 'blockquote-line': false, 'code-block': false };

    /** @var {Quill} */
    quill;

    /**
     * Constructor.
     *
     * @param {Quill} quill - The quill instance the theme is applying to.
     * @param {QuillOptionsStatic} options - The current options for the instance.
     */
    constructor(quill, options) {
        const themeOptions = {
            ...options,
            placeholder: "Create a new post...",
        };

        super(quill, themeOptions);
        this.quill.root.classList.add("richEditor-text");
        this.quill.root.classList.add("userContent");
        this.quill.root.addEventListener("focusin", closeEditorFlyouts);

        // Keyboard behaviours
        this.setupTabBehaviour();
        this.setupNewlineBlockEscapes();
        this.setupKeyboardArrowBlockEscapes();
        this.setupBlockDeleteHandler();

        // Mount react components
        this.mountToolbar();
        this.mountEmojiMenu();
        this.mountParagraphMenu();
    }

    /**
     * Nullify the tab key.
     */
    setupTabBehaviour() {
        // Nullify the tab key.
        this.options.modules.keyboard.bindings.tab = false;
        this.options.modules.keyboard.bindings["indent code-block"] = false;
        this.options.modules.keyboard.bindings["outdent code-block"] = false;
        this.options.modules.keyboard.bindings["remove tab"] = false;
        this.options.modules.keyboard.bindings["code exit"] = false;

    }

    clearEmptyBlot(range) {
        let [line] = this.quill.getLine(range.index);

        const isCodeBlock = line instanceof CodeBlockBlot;
        const isOnlyChild = !line.prev && !line.next;

        if (!isOnlyChild && !isCodeBlock) {
            return true;
        }

        if (line instanceof LineBlot) {
            line = line.getContentBlot();
        }

        // Check if this is the first line a ContentBlot or is a CodeBlot.
        const { textContent } = line.domNode;
        const isLineEmpty = line.children.length === 1 && (textContent === "" || textContent === "\n") ;

        if (!isLineEmpty && !isCodeBlock) {
            return true;
        }

        const delta = new Delta()
            .retain(range.index)
            .delete(1);
        this.quill.updateContents(delta, Emitter.sources.USER);
        return false;
    }

    clearFirstBlotWithContents(range) {
        let [line] = this.quill.getLine(range.index);

        const { textContent } = line.domNode;
        const isLineEmpty = line.children.length === 1 && (textContent === "" || textContent === "\n") ;
        if (isLineEmpty) {
            return true;
        }

        let isFirstInBlot = true;

        if (line instanceof LineBlot) {
            line = line.getWrapperBlot();
            isFirstInBlot = line === line.parent.children.head;
        }

        if (!isFirstInBlot) {
            return true;
        }

        const isFirstInScroll = line === this.quill.scroll.children.head;
        if (!isFirstInScroll) {
            return true;
        }

        const delta = new Delta()
            .retain(line.length(), { 'spoiler-line': false, 'blockquote-line': false, 'code-block': false });
        this.quill.updateContents(delta, Emitter.sources.USER);

        // Return false to prevent default behaviour.
        return false;
    }

    clearFirstPositionMultiLineBlot = (range) => {
        const [line] = this.quill.getLine(range.index);

        if (line instanceof LineBlot || line instanceof CodeBlockBlot) {
            this.clearFirstBlotWithContents(range);
            this.quill.setSelection(range);
        }

        return true;
    };

    setupBlockDeleteHandler() {

        this.options.modules.keyboard.bindings["Clear Blot in First Position Selection"] = {
            key: Keyboard.keys.BACKSPACE,
            collapsed: false,
            handler: this.clearFirstPositionMultiLineBlot,
        };

        this.options.modules.keyboard.bindings["Block Escape Delete"] = {
            key: Keyboard.keys.BACKSPACE,
            offset: 0,
            collapsed: true,
            format: this.constructor.MULTI_LINE_BLOTS,
            handler: this.clearFirstBlotWithContents,
        };

        this.options.modules.keyboard.bindings["Block Escape Backspace"] = {
            key: Keyboard.keys.BACKSPACE,
            collapsed: true,
            format: this.constructor.MULTI_LINE_BLOTS,
            handler: this.clearEmptyBlot,
        };
    }

    insertNewLineAfterBlotAndTrim(range, deleteAmount = 1) {
        const [line, offset] = this.quill.getLine(range.index);

        const newBlot = Parchment.create("block", "");
        let thisBlot = line;
        if (line instanceof LineBlot) {
            thisBlot = line.getWrapperBlot();
        }

        const nextBlot = thisBlot.next;
        newBlot.insertInto(this.quill.scroll, nextBlot);

        // Now we need to clean up that extra newline.
        const positionUpToPreviousNewline = range.index + line.length() - offset;
        const deleteDelta = new Delta()
            .retain(positionUpToPreviousNewline - deleteAmount)
            .delete(deleteAmount);
        this.quill.updateContents(deleteDelta);
        this.quill.setSelection(positionUpToPreviousNewline - deleteAmount);
    }

    /**
     * Add keyboard bindings that allow the user to
     * @private
     */
    setupNewlineBlockEscapes() {
        this.options.modules.keyboard.bindings["MutliLine Escape Enter"] = {
            key: Keyboard.keys.ENTER,
            collapsed: true,
            format: ["spoiler-line", "blockquote-line"],
            handler: (range) => {
                const [line] = this.quill.getLine(range.index);

                const contentBlot = line.getContentBlot();
                if (line !== contentBlot.children.tail) {
                    return true;
                }

                const { textContent } = line.domNode;
                const currentLineIsEmpty = textContent === "";
                if (!currentLineIsEmpty) {
                    return true;
                }

                const previousLine = line.prev;
                if (!previousLine) {
                    return true;
                }

                this.insertNewLineAfterBlotAndTrim(range);

                return false;
            },
        };

        this.options.modules.keyboard.bindings["CodeBlock Escape Enter"] = {
            key: Keyboard.keys.ENTER,
            collapsed: true,
            format: ["code-block"],
            handler: (range) => {
                const [line] = this.quill.getLine(range.index);

                const { textContent } = line.domNode;
                const currentLineIsEmpty = /\n\n\n$/.test(textContent);
                if (!currentLineIsEmpty) {
                    return true;
                }

                this.insertNewLineAfterBlotAndTrim(range, 2);

                return false;
            },
        };

    }

    /**
     * Insert a normal newline before the current range.
     * @private
     *
     * @param {RangeStatic} range - A Quill range.
     *
     * @returns {boolean} false to prevent default.
     */
    insertNewlineBeforeRange(range) {
        // eslint-disable-next-line
        let [line, offset] = this.quill.getLine(range.index);
        const isAtStartOfLine = offset === line.offset();

        if (line instanceof LineBlot) {
            line = line.getWrapperBlot();
        }

        const isFirstBlot = line.parent === line.scroll && line === line.parent.children.head;

        if (isFirstBlot && isAtStartOfLine) {
            // const index = quill.
            const newContents = [
                {
                    insert: "\n",
                },
                ...this.quill.getContents()["ops"],
            ];
            this.quill.setContents(newContents);
        }

        return true;
    }

    /**
     * Insert a normal newline after the current range.
     * @private
     *
     * @param {RangeStatic} range - A Quill range.
     *
     * @returns {boolean} false to prevent default.
     */
    insertNewlineAfterRange(range) {
        // eslint-disable-next-line
        let [line, offset] = this.quill.getLine(range.index);
        const length = line.length();

        // Check that we are at the end of the line.
        const isAtEndOfLine = offset + 1 === length;

        if (line instanceof LineBlot) {
            line = line.getWrapperBlot();
        }

        const isLastBlot = line.parent === line.scroll && line === line.parent.children.tail;

        if (isLastBlot && isAtEndOfLine) {
            // const index = quill.
            const newContents = [
                ...this.quill.getContents()["ops"],
                {
                    insert: "\n",
                },
            ];
            this.quill.setContents(newContents);
            this.quill.setSelection(range.index + 1, 0);
        }

        return true;
    }

    /**
     * Add keyboard bindings that allow the user to escape multi-line blocks with arrow keys.
     */
    setupKeyboardArrowBlockEscapes() {
        const commonCriteria = {
            collapsed: true,
            format: this.constructor.MULTI_LINE_BLOTS,
        };

        this.options.modules.keyboard.bindings["Block Escape Up"] = {
            ...commonCriteria,
            key: Keyboard.keys.UP,
            handler: this.insertNewlineBeforeRange,
        };

        this.options.modules.keyboard.bindings["Block Escape Left"] = {
            ...commonCriteria,
            key: Keyboard.keys.LEFT,
            handler: this.insertNewlineBeforeRange,
        };

        this.options.modules.keyboard.bindings["Block Escape Down"] = {
            ...commonCriteria,
            key: Keyboard.keys.DOWN,
            handler: this.insertNewlineAfterRange,
        };

        this.options.modules.keyboard.bindings["Block Escape Right"] = {
            ...commonCriteria,
            key: Keyboard.keys.RIGHT,
            handler: this.insertNewlineAfterRange,
        };
    }

    /**
     * Mount an inline toolbar (react component).
     */
    mountToolbar() {
        const container = this.quill.container.closest(".richEditor").querySelector(".js-InlineEditorToolbar");
        ReactDOM.render(<InlineEditorToolbar quill={this.quill}/>, container);
    }

    /**
     * Mount the paragraph formatting toolbar (react component).
     */
    mountParagraphMenu() {
        const container = this.quill.container.closest(".richEditor").querySelector(".js-ParagraphEditorToolbar");
        ReactDOM.render(<ParagraphEditorToolbar quill={this.quill}/>, container);
    }

    /**
     * Mount Emoji Menu (react component).
     */
    mountEmojiMenu() {
        const container = this.quill.container.closest(".richEditor").querySelector(".js-emojiHandle");
        ReactDOM.render(<EditorEmojiPicker quill={this.quill}/>, container);
    }
}
