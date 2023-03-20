import { CustomEventClass } from "../helpers/events";
import { reducePromises } from "../helpers/helper";

export class PeerConnectionFactory extends CustomEventClass {
    constructor(rtcOptions: RTCConfiguration) {
        super();
        this.init(rtcOptions);
    }
    private peerConnection: RTCPeerConnection;

    private init(rtcOptions: RTCConfiguration = {}) {
        if (!this.peerConnection || this.peerConnection.signalingState === 'closed') {
            rtcOptions = this.addDefaultIceServers(rtcOptions);
            this.peerConnection = new RTCPeerConnection(rtcOptions);
            if ("ontrack" in this.peerConnection) {
                this.peerConnection.addEventListener("track", (e: RTCTrackEvent) => {
                    this.emit('remoteStream', e.streams[0]);
                });
            }
            this.peerConnection.onsignalingstatechange = () => {
                this.emit('peerConnectionSignalingState', { peerConnectionSignalingState: this.peerConnection.signalingState });
            }
            this.peerConnection.oniceconnectionstatechange = () => {
                console.log("RTCIceConnectionState changed: " + this.peerConnection.iceConnectionState);
                if (this.peerConnection.iceConnectionState === 'connected')
                    this.emit('connected', this.peerConnection.iceConnectionState);
                else if (this.peerConnection.iceConnectionState === "failed")
                    this.iceRestart();
            };
        }
    }

    addStream(stream: MediaStream) {
        this.peerConnection.getSenders().forEach((sender) => {
            this.peerConnection.removeTrack && this.peerConnection.removeTrack(sender);
        });
        if (this.peerConnection.addTrack) {
            stream.getTracks().forEach((track) => {
                this.peerConnection.addTrack(track, stream);
            });
        }
    }

    setDescription(sessionDescription: RTCSessionDescription) {
        this.peerConnection.setRemoteDescription(sessionDescription);
    }

    private addDefaultIceServers(rtcConfiguration: RTCConfiguration): RTCConfiguration {
        if (!rtcConfiguration.iceServers) {
            rtcConfiguration.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
        }
        return rtcConfiguration;
    }

    async createOfferOrAnswer(modifiers: Array<any> = [], iceRestart: boolean = false): Promise<RTCSessionDescription> {
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
                return localDescription;
            }).catch((e) => {
                throw e;
            });
    }

    iceRestart() {
        if (this.peerConnection.signalingState === 'closed') {
            this.init();
        } else {
            this.peerConnection.restartIce();
        }
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

    public end() {
        this.peerConnection.close();
        this.peerConnection = null;
    }

    public close() {
        this.peerConnection.close();
    }

}