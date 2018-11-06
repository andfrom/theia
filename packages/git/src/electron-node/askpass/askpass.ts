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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Based on: https://github.com/Microsoft/THEIA/blob/dd3e2d94f81139f9d18ba15a24c16c6061880b93/extensions/git/src/askpass.ts

import { injectable, postConstruct } from 'inversify';
import * as path from 'path';
import * as http from 'http';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Disposable } from '@theia/core/lib/common/disposable';
import { isWindows } from '@theia/core/lib/common/os';

export interface AskpassEnvironment {
    readonly GIT_ASKPASS: string;
    readonly ELECTRON_RUN_AS_NODE?: string;
    readonly THEIA_GIT_ASKPASS_NODE?: string;
    readonly THEIA_GIT_ASKPASS_MAIN?: string;
    readonly THEIA_GIT_ASKPASS_HANDLE?: string;
}

@injectable()
export class Askpass implements Disposable {

    protected server: http.Server;
    protected ipcHandlePathPromise: Promise<string>;
    protected ipcHandlePath: string | undefined;
    protected enabled = true;

    @postConstruct()
    protected init(): void {
        this.server = http.createServer((req, res) => this.onRequest(req, res));
        this.ipcHandlePathPromise = this.setup().catch(err => {
            console.error(err);
            return '';
        });
    }

    protected async setup(): Promise<string> {
        const buffer = await this.randomBytes(20);
        const nonce = buffer.toString('hex');
        const ipcHandlePath = this.getIPCHandlePath(nonce);
        this.ipcHandlePath = ipcHandlePath;

        try {
            this.server.listen(ipcHandlePath);
            this.server.on('error', err => console.error(err));
        } catch (err) {
            console.error('Could not launch git askpass helper.');
            this.enabled = false;
        }

        return ipcHandlePath;
    }

    protected getIPCHandlePath(nonce: string): string {
        const fileName = `theia-git-askpass-${nonce}-sock`;
        if (isWindows) {
            return `\\\\.\\pipe\\${fileName}`;
        }

        if (process.env['XDG_RUNTIME_DIR']) {
            return path.join(process.env['XDG_RUNTIME_DIR'] as string, fileName);
        }

        return path.join(os.tmpdir(), fileName);
    }

    protected onRequest(req: http.ServerRequest, res: http.ServerResponse): void {
        const chunks: string[] = [];
        req.setEncoding('utf8');
        req.on('data', (d: string) => chunks.push(d));
        req.on('end', () => {
            const { request, host } = JSON.parse(chunks.join(''));

            this.prompt(host, request).then(result => {
                res.writeHead(200);
                res.end(JSON.stringify(result));
            }, () => {
                res.writeHead(500);
                res.end();
            });
        });
    }

    protected async prompt(host: string, request: string): Promise<string> {
        // const options: InputBoxOptions = {
        //     password: /password/i.test(request),
        //     placeHolder: request,
        //     prompt: `Git: ${host}`,
        //     ignoreFocusOut: true
        // };
        if (/password/i.test(request)) {
        }

        if (/username/i.test(request)) {
        }

        // return await window.showInputBox(options) || '';
        console.log('host', host, 'request', request);
        return '';
    }

    protected async randomBytes(size: number): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            crypto.randomBytes(size, (error: Error, buffer: Buffer) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(buffer);
            });
        });
    }

    async getEnv(): Promise<AskpassEnvironment> {
        if (!this.enabled) {
            return {
                GIT_ASKPASS: path.join(__dirname, 'askpass-empty.sh')
            };
        }

        return {
            ELECTRON_RUN_AS_NODE: '1',
            GIT_ASKPASS: path.join(__dirname, '..', '..', '..', 'src', 'electron-node', 'askpass', 'askpass.sh'),
            THEIA_GIT_ASKPASS_NODE: process.execPath,
            THEIA_GIT_ASKPASS_MAIN: path.join(__dirname, 'askpass-main.js'),
            THEIA_GIT_ASKPASS_HANDLE: await this.ipcHandlePathPromise
        };
    }

    dispose(): void {
        this.server.close();
        if (this.ipcHandlePath && !isWindows) {
            fs.unlinkSync(this.ipcHandlePath);
        }
    }

}
