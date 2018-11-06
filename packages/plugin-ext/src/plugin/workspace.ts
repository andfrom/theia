/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import {
    WorkspaceFolder,
    WorkspaceFoldersChangeEvent,
    WorkspaceFolderPickOptions,
    GlobPattern,
    FileSystemWatcher,
    TextDocumentContentProvider,
    Disposable
} from '@theia/plugin';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import {
    WorkspaceExt,
    WorkspaceFolderPickOptionsMain,
    WorkspaceMain,
    PLUGIN_RPC_CONTEXT as Ext
} from '../api/plugin-api';
import { Path } from '@theia/core/lib/common/path';
import { RPCProtocol } from '../api/rpc-protocol';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';
import URI from 'vscode-uri';

export class WorkspaceExtImpl implements WorkspaceExt {

    private proxy: WorkspaceMain;

    private workspaceFoldersChangedEmitter = new Emitter<WorkspaceFoldersChangeEvent>();
    public readonly onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent> = this.workspaceFoldersChangedEmitter.event;

    private folders: WorkspaceFolder[] | undefined;

    private documentContentProviders = new Map<string, TextDocumentContentProvider>();

    constructor(rpc: RPCProtocol, private editorsAndDocuments: EditorsAndDocumentsExtImpl) {
        this.proxy = rpc.getProxy(Ext.WORKSPACE_MAIN);
    }

    get workspaceFolders(): WorkspaceFolder[] | undefined {
        return this.folders;
    }

    get name(): string | undefined {
        if (this.workspaceFolders) {
            return new Path(this.workspaceFolders[0].uri.path).base;
        }

        return undefined;
    }

    $onWorkspaceFoldersChanged(event: WorkspaceFoldersChangeEvent): void {
        this.folders = event.added;
        this.workspaceFoldersChangedEmitter.fire(event);
    }

    pickWorkspaceFolder(options?: WorkspaceFolderPickOptions): PromiseLike<WorkspaceFolder | undefined> {
        return new Promise((resolve, reject) => {
            const optionsMain = {
                placeHolder: options && options.placeHolder ? options.placeHolder : undefined,
                ignoreFocusOut: options && options.ignoreFocusOut
            } as WorkspaceFolderPickOptionsMain;

            this.proxy.$pickWorkspaceFolder(optionsMain).then(value => {
                resolve(value);
            });
        });
    }

    findFiles(include: GlobPattern, exclude?: GlobPattern | undefined, maxResults?: number,
        token: CancellationToken = CancellationToken.None): PromiseLike<URI[]> {
        let includePattern: string;
        if (include) {
            if (typeof include === 'string') {
                includePattern = include;
            } else {
                includePattern = include.pattern;
            }
        } else {
            includePattern = '';
        }

        let excludePatternOrDisregardExcludes: string | false;
        if (exclude === undefined) {
            excludePatternOrDisregardExcludes = false;
        } else if (exclude) {
            if (typeof exclude === 'string') {
                excludePatternOrDisregardExcludes = exclude;
            } else {
                excludePatternOrDisregardExcludes = exclude.pattern;
            }
        } else {
            excludePatternOrDisregardExcludes = false;
        }

        if (token && token.isCancellationRequested) {
            return Promise.resolve([]);
        }

        return this.proxy.$startFileSearch(includePattern, excludePatternOrDisregardExcludes, maxResults, token)
            .then(data => Array.isArray(data) ? data.map(URI.revive) : []);
    }

    createFileSystemWatcher(globPattern: GlobPattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): FileSystemWatcher {
        // FIXME: to implement
        return new Proxy(<FileSystemWatcher>{}, {});
    }

    registerTextDocumentContentProvider(scheme: string, provider: TextDocumentContentProvider): Disposable {
        if (scheme === 'file' || scheme === 'untitled' || this.documentContentProviders.has(scheme)) {
            throw new Error(`Text Content Document Provider for scheme '${scheme}' is already registered`);
        }

        this.documentContentProviders.set(scheme, provider);
        this.proxy.$registerTextDocumentContentProvider(scheme);

        let onDidChangeSubscription: Disposable;
        if (typeof provider.onDidChange === 'function') {
            onDidChangeSubscription = provider.onDidChange(async uri => {
                if (uri.scheme === scheme && this.editorsAndDocuments.getDocument(uri.toString())) {
                    const newContent = await this.$provideTextDocumentContent(uri.toString());
                    if (!newContent) {
                        return;
                    }

                    this.proxy.$onTextDocumentContentChange(uri.toString(), newContent);
                    return;
                }
            });
        }

        const instance = this;
        return {
            dispose() {
                if (instance.documentContentProviders.delete(scheme)) {
                    instance.proxy.$unregisterTextDocumentContentProvider(scheme);
                }

                if (onDidChangeSubscription) {
                    onDidChangeSubscription.dispose();
                }
            }
        };
    }

    async $provideTextDocumentContent(documentURI: string): Promise<string | undefined> {
        const uri = URI.parse(documentURI);
        const provider = this.documentContentProviders.get(uri.scheme);
        if (provider) {
            return provider.provideTextDocumentContent(uri, CancellationToken.None);
        }

        return undefined;
    }

}
