/**
 * MEI Editor - Integrates CodeMirror and Verovio for side-by-side MEI editing
 */

// Import CodeMirror 6
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { xml } from "@codemirror/lang-xml";
import { indentUnit } from "@codemirror/language";

// Import playback state checker
import { isPlayingMidi } from './verovio/playback.js';

class MEIEditor {
    constructor(container, editorId) {
        this.container = container;
        this.editorId = editorId;
        this.referenceInput = container.querySelector('[id$="meiInput"]');
        this.codeMirrorDiv = container.querySelector('div.codemirror');
        this.verovioInput = container.querySelector('[id$="verovioInput"]');
        this.codeMirrorInstance = null;
        this.autoUpdate = true;
        this.updateTimeout = null;
    }

    async initialize() {
        if (!this.referenceInput || !this.codeMirrorDiv || !this.verovioInput) {
            console.error('MEI Editor: Required elements not found', {
                referenceInput: !!this.referenceInput,
                codeMirrorDiv: !!this.codeMirrorDiv,
                verovioInput: !!this.verovioInput
            });
            return;
        }

        // Initialize content
        if (!this.referenceInput.value.trim()) {
            console.warn('MEI Editor: No content found in reference input');
            return;
        } else {
            try {
                const decodedContent = this.referenceInput.value;
                this.verovioInput.value = decodedContent;
            } catch (e) {
                console.error('MEI Editor: Failed to decode reference input content');
                return;
            }
        }

        // Initialize our own CodeMirror instance
        try {
            this.createCodeMirrorInstance();
            updateStatus(this.editorId, 'CodeMirror initialized');
        } catch (error) {
            console.error('CodeMirror initialization failed:', error);
            updateStatus(this.editorId, 'CodeMirror initialization failed', 'error');
        }

        // Just verify that Verovio is available globally - don't initialize it
        if (!window.app) {
            console.error('Verovio app not available on window.app');
            updateStatus(this.editorId, 'Verovio not available', 'error');
        } else {
            updateStatus(this.editorId, 'MEI Editor ready');
        }

        this.setupSynchronization();
        this.connectControls();
        this.setupCollapseListeners();
    }

    createCodeMirrorInstance() {
        // Create our own CodeMirror 6 instance
        const editorView = new EditorView({
            state: EditorState.create({
                doc: this.referenceInput.value,
                extensions: [
                    basicSetup,
                    xml(),
                    indentUnit.of('    '), // Set indentation to 4 spaces
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            // Update the reference input directly
                            const content = update.state.doc.toString();
                            this.referenceInput.value = content;

                            // Trigger auto-update if enabled
                            if (this.autoUpdate) {
                                this.debouncedUpdate();
                            }
                        }
                    }),
                ],
            }),
            extensions: [
                EditorView.lineWrapping,
            ],
            parent: this.codeMirrorDiv
        });

        // Store the instance
        this.codeMirrorInstance = editorView;
        return editorView;
    }

    setupSynchronization() {
        // Auto-update checkbox
        const autoUpdateCheckbox = document.getElementById(this.editorId + 'AutoUpdateCheckbox');
        if (autoUpdateCheckbox) {
            this.autoUpdate = autoUpdateCheckbox.checked;
            autoUpdateCheckbox.addEventListener('change', (e) => {
                this.autoUpdate = e.target.checked;
                updateStatus(this.editorId, this.autoUpdate ? 'Auto-update enabled' : 'Auto-update disabled');
            });
        }

        // CodeMirror change events are handled in the createCodeMirrorInstance method
        // via the EditorView.updateListener extension

        // Manual update button
        const updateButton = document.getElementById(this.editorId + 'UpdateButton');
        if (updateButton) {
            updateButton.addEventListener('click', () => {
                this.syncCodeMirrorToVerovio();
            });
        }
    }

    debouncedUpdate() {
        // Don't auto-update if MIDI is currently playing to avoid interrupting playback
        if (isPlayingMidi()) {
            return;
        }

        if (this.updateTimeout) clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => {
            this.syncCodeMirrorToVerovio();
        }, 500);
    }

    syncCodeMirrorToVerovio() {
        // Check if global Verovio app is available
        if (!window.app) {
            console.error('Verovio app not available on window.app');
            updateStatus(this.editorId, 'Verovio not available', 'error');
            return;
        }

        try {
            // Get content from our CodeMirror instance
            let content;
            if (this.codeMirrorInstance && this.codeMirrorInstance.state) {
                content = this.codeMirrorInstance.state.doc.toString();
            } else {
                content = this.referenceInput.value;
            }

            // Check if content is valid XML before sending to Verovio
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(content, 'application/xml');
                const parseError = doc.querySelector('parsererror');
                if (parseError) {
                    console.warn('Invalid XML detected, skipping Verovio update:', parseError.textContent);
                    updateStatus(this.editorId, 'Invalid XML - notation not updated', 'error');
                    return;
                }
            } catch (xmlError) {
                console.warn('XML validation failed:', xmlError);
                return;
            }

            // Update the reference input and verovio input
            this.referenceInput.value = content;
            this.verovioInput.value = content;

            // Load data into the global Verovio app and trigger re-render
            window.app.loadData(content, 'editor.mei');
            if (typeof window.app.renderCurrentPage === 'function') {
                window.app.renderCurrentPage();
            }

            // Update pagination controls to reflect new page count
            if (window.app.navigationController) {
                window.app.navigationController.updatePageCount();
                // Update pagination UI if toolbar is available
                const toolbar = document.querySelector('[data-editor="verovio-toolbar"]');
                if (toolbar && window.app.navigationController.updatePaginationUI) {
                    window.app.navigationController.updatePaginationUI(toolbar);
                }
            }

            updateStatus(this.editorId, 'Notation updated');
        } catch (error) {
            console.error('Error syncing to Verovio:', error);
            updateStatus(this.editorId, 'Update failed: ' + error.message, 'error');
        }
    }

    connectControls() {
        // Format XML button
        const formatButton = document.getElementById(this.editorId + 'FormatButton');
        if (formatButton) {
            formatButton.addEventListener('click', () => {
                this.formatXML();
            });
        }

        // Validate XML button
        const validateButton = document.getElementById(this.editorId + 'ValidateButton');
        if (validateButton) {
            validateButton.addEventListener('click', () => {
                this.validateXML();
            });
        }
    }

    formatXML() {
        try {
            let content;
            if (this.codeMirrorInstance && this.codeMirrorInstance.state) {
                content = this.codeMirrorInstance.state.doc.toString();
            } else {
                content = this.referenceInput.value;
            }

            // Simple XML formatting (you might want to use a proper XML formatter)
            const formatted = this.simpleXMLFormat(content);

            if (this.codeMirrorInstance && this.codeMirrorInstance.dispatch) {
                // CodeMirror 6 style
                this.codeMirrorInstance.dispatch({
                    changes: {
                        from: 0,
                        to: this.codeMirrorInstance.state.doc.length,
                        insert: formatted
                    }
                });
            } else {
                this.referenceInput.value = formatted;
            }

            updateStatus(this.editorId, 'XML formatted');
        } catch (error) {
            updateStatus(this.editorId, 'Error formatting XML', 'error');
        }
    }

    validateXML() {
        try {
            let content;
            if (this.codeMirrorInstance && this.codeMirrorInstance.state) {
                content = this.codeMirrorInstance.state.doc.toString();
            } else {
                content = this.referenceInput.value;
            }

            // Basic XML validation
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'application/xml');
            const parseError = doc.querySelector('parsererror');

            if (parseError) {
                updateStatus(this.editorId, 'XML validation failed: ' + parseError.textContent, 'error');
            } else {
                updateStatus(this.editorId, 'XML is valid', 'success');
            }
        } catch (error) {
            updateStatus(this.editorId, 'Error validating XML', 'error');
        }
    }

    simpleXMLFormat(xml) {
        // Simple XML formatting - you might want to use a proper library
        let formatted = '';
        let indent = 0;
        const tab = '  ';

        xml.split(/>\s*</).forEach((node, index) => {
            if (index > 0) formatted += '<';
            if (index < xml.split(/>\s*</).length - 1) node += '>';

            const isClosingTag = node.charAt(0) === '/';
            const isSelfClosing = node.charAt(node.length - 2) === '/';

            if (isClosingTag) indent--;

            formatted += tab.repeat(Math.max(0, indent)) + node + '\n';

            if (!isClosingTag && !isSelfClosing) indent++;
        });

        return formatted.trim();
    }

    setupCollapseListeners() {
        // Find the CodeMirror panel body
        const codePanel = this.container.querySelector('.mei-code-panel .panel-body');

        if (!codePanel) {
            console.warn('MEI Editor: Could not find code panel for collapse listener');
            return;
        }

        // Listen for Bootstrap collapse events
        codePanel.addEventListener('hidden.bs.collapse', () => {
            // CodeMirror is now collapsed, add class to container
            this.container.classList.add('code-collapsed');
        });

        codePanel.addEventListener('shown.bs.collapse', () => {
            // CodeMirror is now shown, remove class from container
            this.container.classList.remove('code-collapsed');
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('[data-editor="mei"]');
    if (!container) return;
    const editorId = container.getAttribute('data-editor-id') || 'mei-editor';
    const instance = new MEIEditor(container, editorId);
    instance.initialize();
});

function updateStatus(editorId, message, type = 'info') {
    const statusText = document.getElementById(editorId + 'StatusText');
    if (statusText) {
        statusText.textContent = message;
        statusText.className = 'status-text';
        if (type === 'error') {
            statusText.classList.add('text-danger');
        } else if (type === 'success') {
            statusText.classList.add('text-success');
        }
    }
    console.log(`[${editorId}] ${type.toUpperCase()}: ${message}`);
}
