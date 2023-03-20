import { reducePromises } from "../helpers/helper";
import { RegistrationData } from "../interfaces/interface";
import { CustomEventClass } from "./events";


class CallService extends CustomEventClass {
    constructor() {
        super();
        this.initSharedWorker();
    }
    private sharedWorker: SharedWorker;
    private localStream: MediaStream;
    private peerConnection: RTCPeerConnection;
    callStatus: string = 'unregistered';
    private initSharedWorker() {
        this.sharedWorker = (new SharedWorker('./sharedWorker.bundle.js'));
        this.sharedWorker.port.onmessage = ({ data }) => {
            
            if (!data.type) return;
            switch (data.type) {
                case 'initPeerConnection':
                    this.setCallState('connecting');
                    this.setUpPeerconnection();
                    break;
                case 'getMediaStream':
                    this.getStreamAndAddTracks();
                    break;
                case 'setDescription':
                    this.setDescription(data.modifiedDescription);
                    break;
                case 'createOfferOrAnswer':
                    this.createOfferOrAnswer(data.modifiers);
                    break;
                case 'ended':
                    this.releaseMedia();
                    this.setCallState(data.type);
                    break;
                case 'connected':
                    this.setCallState(data.type);
                    break;
                case 'registrationState':
                    this.setCallState(data.state ? 'registred' : 'unregistered');
                default:
                    break;
            }
        }
    }

    private setCallState(state: string){
        this.emit('state',state);
        this.callStatus = state;
    }

    private setDescription(sessionDescription: RTCSessionDescription) {
        this.peerConnection.setRemoteDescription(sessionDescription);
    }

    private async getStreamAndAddTracks(): Promise<MediaStream> {
        return new Promise(async (resolve, reject) => {
            if (!this.peerConnection) {
                this.setUpPeerconnection();
            }
            if (this.localStream) {
                resolve(this.localStream);
            }
            let audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.localStream = audioStream;
            if (this.peerConnection) {
                this.peerConnection.getSenders().forEach((sender) => {
                    this.peerConnection.removeTrack && this.peerConnection.removeTrack(sender);
                });
                if (this.peerConnection.addTrack) {
                    audioStream.getTracks().forEach((track) => {
                        this.peerConnection.addTrack(track, audioStream);
                    });
                }
                resolve(audioStream)
            } else {
                reject(false);
            }
        })
    }

    private createRTCSessionDescriptionInit(RTCSessionDescription: RTCSessionDescriptionInit) {
        return {
            type: RTCSessionDescription.type,
            sdp: RTCSessionDescription.sdp
        };
    }

    private waitForIceGatheringComplete() {
        console.log("waitForIceGatheringComplete");
        if (this.isIceGatheringComplete()) {
            console.log("ICE is already complete. Return resolved.");
            return Promise.resolve();
        }
    }
    private isIceGatheringComplete(): boolean {
        return this.peerConnection.iceGatheringState === "complete";
    }
    private hasOffer(where: string): boolean {
        const offerState = "have-" + where + "-offer";
        return this.peerConnection.signalingState === offerState;
    }
    private createOfferOrAnswer(modifiers: Array<any> = [], iceRestart: boolean = false): Promise<RTCSessionDescription> {
        if (this.peerConnection.signalingState === 'have-local-offer') {
            const localDescription = this.createRTCSessionDescriptionInit(this.peerConnection.localDescription);
            return reducePromises(modifiers, localDescription);
        }
        let RTCOfferOptions: RTCOfferOptions = {};
        if (iceRestart) {
            RTCOfferOptions.iceRestart = iceRestart;
        }
        const pc: RTCPeerConnection = this.peerConnection;
        const method = this.hasOffer("remote") ? pc.createAnswer : pc.createOffer;
        return method.apply(pc, RTCOfferOptions).catch((e) => {
            console.error(e);
            throw e;
        }).then((sdp) => reducePromises(modifiers, this.createRTCSessionDescriptionInit(sdp))).then((sdp) => {
            console.log("Setting local sdp.");
            console.log("sdp is " + sdp.sdp || false);
            return pc.setLocalDescription(sdp);
        }).catch((e) => {
            console.error(e);
            throw e;
        }).then(() => this.waitForIceGatheringComplete())
            .then(() => {
                if (!this.peerConnection.localDescription) {
                    throw "Missing local description.";
                }
                const localDescription = this.createRTCSessionDescriptionInit(this.peerConnection.localDescription);
                return reducePromises(modifiers, localDescription);
            }).then((localDescription) => {
                this.postMessage('localDescription', { localDescription })
                return localDescription;
            }).catch((e) => {
                throw e;
            });
    }

    private setUpPeerconnection(rtcOptions = {}) {
        if (!this.peerConnection || this.peerConnection.signalingState === 'closed') {
            rtcOptions = this.addDefaultIceServers(rtcOptions);
            this.peerConnection = new RTCPeerConnection(rtcOptions);
            if ("ontrack" in this.peerConnection) {
                this.peerConnection.addEventListener("track", (e: RTCTrackEvent) => {
                    this.emit('remoteStream',e.streams[0]);
                });
            }
            this.peerConnection.onsignalingstatechange = () => {
                this.postMessage('peerConnectionSignalingState', { peerConnectionSignalingState: this.peerConnection.signalingState });
            }
            this.peerConnection.oniceconnectionstatechange = () => {
                console.log("RTCIceConnectionState changed: " + this.peerConnection.iceConnectionState);
                if (this.peerConnection.iceConnectionState === 'connected')
                    this.setCallState(this.peerConnection.iceConnectionState);
                else if (this.peerConnection.iceConnectionState === "failed")
                    this.iceRestart();
            };
        }
    }
    private postMessage(type: string, data: object = {}) {
        this.sharedWorker.port.postMessage({ type, ...data });
    }

    private releaseMedia() {
        this.localStream && this.localStream.getTracks && this.localStream.getTracks().forEach((track) => {
            track.stop();
        })
        this.localStream = null;
    }


    private addDefaultIceServers(rtcConfiguration: RTCConfiguration): RTCConfiguration {
        if (!rtcConfiguration.iceServers) {
            rtcConfiguration.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
        }
        return rtcConfiguration;
    }
    private iceRestart() {
        this.createOfferOrAnswer([], true);
        this.postMessage('reconnect');
    }

    register(registrationData: RegistrationData) {
        this.setCallState('registering');
        this.postMessage('register', { registrationData });
    }
    call(number: number) {
        this.postMessage('call', { number });
    }
    disconnect() {
        this.postMessage('disconnect');
        this.peerConnection.close();
        this.releaseMedia();
        this.setCallState('disconnected');
    }
    async reconnect() {
        if (this.peerConnection.signalingState === 'closed') {
            this.peerConnection.restartIce();
            this.postMessage('reconnect');
        } else {
            await this.getStreamAndAddTracks().then(() => {
                this.iceRestart();
            });
        }
    }
    end() {
        this.postMessage('endSession');
        this.peerConnection.close()
    }

}

export { CallService }