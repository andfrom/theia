/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, postConstruct } from 'inversify';
// import { Event, Emitter } from '@theia/core/lib/common/event';
import { JsonRpcServer } from '@theia/core/lib/common/messaging/proxy-factory';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { JsonRpcProxy } from '@theia/core';

export const GitPromptServer = Symbol('GitPromptServer');
export interface GitPromptServer extends JsonRpcServer<GitPromptClient> {
}

export const GitPromptServerProxy = Symbol('GitPromptServerProxy');
export interface GitPromptServerProxy extends JsonRpcProxy<GitPromptServer> {
}

@injectable()
export class GitPrompt implements GitPromptClient, Disposable {

    @inject(GitPromptServer)
    protected readonly server: GitPromptServer;

    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.server.setClient(this);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    // TODO password?
    async ask(question: string): Promise<string | undefined> {
        console.log('ask', question);
        return undefined;
    }

    async confirm(question: string): Promise<boolean | undefined> {
        console.log('confirm', question);
        return undefined;
    }

}

export namespace GitPrompt {

    /**
     * Unique WS endpoint path for the Git prompt service.
     */
    export const WS_PATH = 'services/git-prompt';

}

export const GitPromptClient = Symbol('GitPromptClient');
export interface GitPromptClient {

    ask(question: string): Promise<string | undefined>;

    confirm(question: string): Promise<boolean | undefined>;

    // XXX support for `select`?

}

@injectable()
export class ReconnectingGitPromptServer implements GitPromptServer {

    @inject(GitPromptServerProxy)
    protected readonly proxy: GitPromptServerProxy;

    @postConstruct()
    protected init(): void {
        // this.proxy.onDidCloseConnection(() => this.rec)
    }

    setClient(client: GitPromptClient): void {
        this.proxy.setClient(client);
    }

    dispose(): void {
        this.proxy.dispose();
    }

}
