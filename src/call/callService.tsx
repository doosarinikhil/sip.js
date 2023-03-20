import { RegistrationData } from "../interfaces/interface";
import { CustomEventClass } from "../helpers/events";
import { PeerConnectionFactory } from "./peerConnectionFactory";


class CallService extends CustomEventClass {
    constructor() {
        super();
        this.initSharedWorker();
    }
    private sharedWorker: SharedWorker;
    private localStream: MediaStream;
    private peerConnection: PeerConnectionFactory;
    callStatus: string = 'unregistered';
    private initSharedWorker() {
        this.sharedWorker = (new SharedWorker('./sharedWorker.bundle.js'));
        this.sharedWorker.port.onmessage = ({ data }) => {

            if (!data.type) return;
            switch (data.type) {
                case 'initPeerConnection':
                    this.setCallState('connecting');
                    this.setUpPeerconnection()
                    break;
                case 'getMediaStream':
                    this.getStreamAndAddTracks();
                    break;
                case 'setDescription':
                    this.peerConnection.setDescription(data.modifiedDescription);
                    break;
                case 'createOfferOrAnswer':
                    this.peerConnection.createOfferOrAnswer(data.modifiers).then((localDescription: RTCSessionDescription) => {
                        this.postMessage('localDescription', { localDescription });
                    })
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

    private setCallState(state: string) {
        this.emit('state', state);
        this.callStatus = state;
    }
    private setUpPeerconnection(rtcOptions: RTCConfiguration = {}) {
        if (!this.peerConnection) {
            this.peerConnection = new PeerConnectionFactory(rtcOptions);
            this.peerConnection.on('peerConnectionSignalingState', this.sendSignalingstatus.bind(this));
            this.peerConnection.on('connected', this.setCallState.bind(this));
            this.peerConnection.on('remoteStream', this.sendRemoteStream.bind(this));
        }
    }
    private sendSignalingstatus(data: object) {
        this.postMessage('peerConnectionSignalingState', data)
    }
    private sendRemoteStream(stream: MediaStream) {
        this.emit('remoteStream', stream);
    }
    private async getStreamAndAddTracks(): Promise<MediaStream> {
        return new Promise(async (resolve, reject) => {
            if (this.localStream) {
                resolve(this.localStream);
            }
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            if (this.localStream) {
                this.peerConnection.addStream(this.localStream);
                resolve(this.localStream);
            } else {
                reject(null);
            }
        })
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
        this.peerConnection.iceRestart();
        await this.getStreamAndAddTracks().then(() => {
            this.postMessage('reconnect');
        });
    }
    end() {
        this.postMessage('endSession');
        this.peerConnection.end()
        this.peerConnection.off('peerConnectionSignalingState', this.sendSignalingstatus.bind(this));
        this.peerConnection.off('connected', this.setCallState.bind(this));
        this.peerConnection.off('remoteStream', this.sendRemoteStream.bind(this));
        this.peerConnection = null;
    }

}

export { CallService }