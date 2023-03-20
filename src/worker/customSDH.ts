import { BodyAndContentType, SessionDescriptionHandlerModifier } from 'sip.js';
import { SessionDescriptionHandler, SessionDescriptionHandlerOptions } from 'sip.js/lib/api/session-description-handler'
import { CustomEventClass } from '../helpers/events';
import { sleep, reducePromises } from '../helpers/helper';

export class CustomSessionDescriptionHandler extends CustomEventClass implements SessionDescriptionHandler {

    public outGoingCall: boolean = false;
    public localDescription: any;
    public peerConnectionSignalingState: string;
    close(): void {
        this.emit('closed');
    }
    hasDescription(contentType: string): boolean {
        return contentType === 'application/sdp'
    }
    rollbackDescription?(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    sendDtmf(tones: string, options?: unknown): boolean {
        throw new Error('Method not implemented.');
    }

    async getDescription(options?: SessionDescriptionHandlerOptions, modifiers?: Array<SessionDescriptionHandlerModifier>): Promise<BodyAndContentType> {
        return Promise.resolve().then(async () => {
            //TO-DO Need to handle this.
            await sleep(4);
            this.emit('createSDP', { modifiers });
            await sleep(4);
            if (!this.localDescription) await sleep(4);
            return this.localDescription;
        }).then((description) => {
            if (description.sdp === undefined) {
                throw ("SDP undefined.");
            }
            return {
                body: description.sdp,
                contentType: 'application/sdp'
            };
        });
    }
    async setDescription(sessionDescription: string, options?: SessionDescriptionHandlerOptions | any, modifiers?: SessionDescriptionHandlerModifier[]): Promise<void> {
        if (!Array.isArray(modifiers)) {
            modifiers = [modifiers];
        }
        const description = {
            type: this.hasOffer("local") ? "answer" : "offer",
            sdp: sessionDescription
        };
        return reducePromises(modifiers, description).then((modifiedDescription) => {
            this.emit('remoteSDP', { modifiedDescription });
            return;
        }).catch((e) => {
            throw e;
        });
    }

    private hasOffer(where: string): boolean {
        const offerState = "have-" + where + "-offer";
        return this.peerConnectionSignalingState === offerState;
    }
}