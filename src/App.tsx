/* eslint-disable react/react-in-jsx-scope */
// App.tsx

import { useEffect, useState, createRef, useRef } from 'react';
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";



const App = () => {

  const [localStream, setLocalStream] = useState<MediaStream>();
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection>();
  const [callStatus, setCallStatus] = useState('unregistered');
  const audioRef = useRef(null)
  const sharedWorker = useRef<SharedWorker>();


  useEffect(() => {

    sharedWorker.current = (new SharedWorker('./sharedWorker.bundle.js'));

  }, []);

  useEffect(() => {
    if (sharedWorker.current)
      sharedWorker.current.port.onmessage = (event) => {

        const data = event.data;
        console.log(" onmessage -- ", data)
        if (!data.type) return;
        switch (data.type) {
          case 'initPeerConnection':
            setCallStatus('connecting')
            setUpPeerconnection();
            break;
          case 'getMediaStream':
            getStreamAndAddTracks();
            break;
          case 'setDescription':
            setDescription(data.modifiedDescription);
            break;
          case 'createOfferOrAnswer':
            createOfferOrAnswer(data.modifiers);
            break;
          case 'ended':
            releaseMedia();
            setCallStatus(data.type);
            break;
          case 'connected':
            setCallStatus(data.type);
            break;
          case 'registrationState':
            setCallStatus(data.state ? 'registred' : 'unregistered');
          default:
            break;
        }
      }
  }, [sharedWorker, peerConnection, localStream]);

  useEffect(() => {
    if (peerConnection) {
      if ("ontrack" in peerConnection) {
        peerConnection.addEventListener("track", (e: RTCTrackEvent) => {
          console.log("track added", e);
          const remoteStream = e.streams[0];
          audioRef.current.srcObject = remoteStream;
          audioRef.current.play();
          setCallStatus('connected')
        });
      }
      peerConnection.onsignalingstatechange = () => {
        emitMessage('peerConnectionSignalingState', { peerConnectionSignalingState: peerConnection.signalingState });
        console.log("signalingstatechange changed: " + peerConnection.signalingState);
      }
      peerConnection.oniceconnectionstatechange = () => {
        console.log("RTCIceConnectionState changed: " + peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'connected')
          setCallStatus(peerConnection.iceConnectionState);
        else if (peerConnection.iceConnectionState === "failed")
          iceRestart();
      };
    }
  }, [peerConnection]);
  const register = () => {
    setCallStatus('registering')
    let registrationData: object = {
      proxyAddress: process.env.PROXY_ADDRESS,
      exNumber: parseInt(process.env.EX_NUMBER),
      userName: process.env.USERNAME,
      password: process.env.PASSWORD,
      sipJslogLevel: process.env.SIPJS_LOG_LEVEL,
      wsUrl: process.env.WS_URL
    }
    emitMessage('register', { registrationData });
  }

  const call = () => {
    emitMessage('call', { number: parseInt(process.env.CALL_TO) });
  }

  const disconnect = () => {
    emitMessage('disconnect');
    peerConnection.close();
    releaseMedia();
    setCallStatus('disconnected')
  }
  const reconnect = async () => {
    if (peerConnection.signalingState === 'closed') {
      peerConnection.restartIce();
      emitMessage('reconnect');
    } else {
      await getStreamAndAddTracks().then(() => {
        iceRestart();
      });
    }
  }
  const iceRestart = () => {
    createOfferOrAnswer([], true);
    emitMessage('reconnect');
  }
  const endCall = () => {
    emitMessage('endSession');
    audioRef.current.srcObject = undefined;
    peerConnection.close()
  }
  const setDescription = (sessionDescription: RTCSessionDescription) => {
    peerConnection.setRemoteDescription(sessionDescription);
  }

  const getStreamAndAddTracks = async (): Promise<MediaStream> => {
    return new Promise(async (resolve, reject) => {
      if (!peerConnection) {
        setUpPeerconnection();
      }
      if (localStream) {
        resolve(localStream);
      }
      let audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setLocalStream(audioStream)
      if (peerConnection) {
        peerConnection.getSenders().forEach((sender) => {
          peerConnection.removeTrack && peerConnection.removeTrack(sender);
        });
        if (peerConnection.addTrack) {
          audioStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, audioStream);
          });
        }
        resolve(audioStream)
      } else {
        reject(false);
      }
    })
  }

  const reducePromises = (arr: Array<any>, val: any): Promise<RTCSessionDescription> => {
    return arr.reduce((acc, fn) => {
      acc = acc.then(fn);
      return acc;
    }, Promise.resolve(val));
  }
  const createRTCSessionDescriptionInit = (RTCSessionDescription: RTCSessionDescription) => {
    return {
      type: RTCSessionDescription.type,
      sdp: RTCSessionDescription.sdp
    };
  }

  const waitForIceGatheringComplete = () => {
    console.log("waitForIceGatheringComplete");
    if (isIceGatheringComplete()) {
      console.log("ICE is already complete. Return resolved.");
      return Promise.resolve();
    }
  }
  const isIceGatheringComplete = (): boolean => {
    return peerConnection.iceGatheringState === "complete";
  }
  const hasOffer = (where: string): boolean => {
    const offerState = "have-" + where + "-offer";
    return peerConnection.signalingState === offerState;
  }
  const createOfferOrAnswer = (modifiers: Array<any> = [], iceRestart: boolean = false): Promise<RTCSessionDescription> => {
    if (peerConnection.signalingState === 'have-local-offer') {
      const localDescription = createRTCSessionDescriptionInit(peerConnection.localDescription);
      return reducePromises(modifiers, localDescription);
    }
    let RTCOfferOptions: RTCOfferOptions = {};
    if (iceRestart) {
      RTCOfferOptions.iceRestart = iceRestart;
    }
    const pc: RTCPeerConnection = peerConnection;
    const method = hasOffer("remote") ? pc.createAnswer : pc.createOffer;
    return method.apply(pc, RTCOfferOptions).catch((e) => {
      console.error(e);
      throw e;
    }).then((sdp) => reducePromises(modifiers, createRTCSessionDescriptionInit(sdp))).then((sdp) => {
      console.log("Setting local sdp.");
      console.log("sdp is " + sdp.sdp || false);
      return pc.setLocalDescription(sdp);
    }).catch((e) => {
      console.error(e);
      throw e;
    }).then(() => waitForIceGatheringComplete())
      .then(() => {
        if (!peerConnection.localDescription) {
          throw "Missing local description.";
        }
        const localDescription = createRTCSessionDescriptionInit(peerConnection.localDescription);
        return reducePromises(modifiers, localDescription);
      }).then((localDescription) => {
        emitMessage('localDescription', { localDescription })
        return localDescription;
      }).catch((e) => {
        throw e;
      });
  }

  const setUpPeerconnection = (rtcOptions = {}) => {
    if (!peerConnection || peerConnection.signalingState === 'closed') {
      rtcOptions = addDefaultIceServers(rtcOptions);
      let Connection = new RTCPeerConnection(rtcOptions);
      setPeerConnection(Connection);
    }
  }
  const emitMessage = (type: string, data: object = {}) => {
    sharedWorker.current.port.postMessage({ type, ...data });
  }

  const releaseMedia = () => {
    localStream && localStream.getTracks && localStream.getTracks().forEach((track) => {
      track.stop();
    })
    setLocalStream(null);
  }


  const addDefaultIceServers = (rtcConfiguration: RTCConfiguration): RTCConfiguration => {
    if (!rtcConfiguration.iceServers) {
      rtcConfiguration.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    }
    return rtcConfiguration;
  }

  return (

    <>
      <Navbar>
        <Container>
          <Navbar.Brand href="#home">Sip.JS Demo</Navbar.Brand>
          <Navbar.Toggle />
          <Navbar className="justify-content-end">
            <Navbar.Text>
              {callStatus == "unregistered" && (
                <Button onClick={register} variant="dark">
                  Register
                </Button>
              )}
            </Navbar.Text>
            <Navbar.Text>
              {callStatus == "registred" && (
                <Button variant="success" onClick={call}>
                  Call
                </Button>
              )}
            </Navbar.Text>
          </Navbar>
        </Container>
      </Navbar>

      {callStatus != "unregistered" &&
        <Card style={{ width: "18rem" }} className="mx-auto">
          <Card.Header>
            Status: {callStatus}
          </Card.Header>
          <Card.Body>
            {callStatus == "connected" && (
              <>
                <Button variant="danger" onClick={disconnect}>
                  Disconnect
                </Button>
              </>
            )}
            {callStatus == "disconnected" && (
              <>
                <Button variant="danger" onClick={reconnect}>
                  Reconnect
                </Button>
              </>
            )}
            {callStatus == "connected" && (
              <>
                <Button variant="danger" onClick={endCall}>
                  End
                </Button>
              </>
            )}
          </Card.Body>
        </Card>
      }
      <div className="mt-4">
        <audio ref={audioRef} autoPlay playsInline />
      </div>
    </>
  )
}

export default App;