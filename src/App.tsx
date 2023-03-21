/* eslint-disable react/react-in-jsx-scope */
// App.tsx

import { useEffect, useState, useRef } from 'react';
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import { CallService } from './call/callService';
import { CallOptions, LogLevel, RegistrationData } from './interfaces/interface';



const App = () => {

  const audioRef = useRef(null)
  const [callService, setCallService] = useState<CallService>(null);
  const [callStatus, setCallStatus] = useState('unregistered');


  useEffect(() => {
    setCallService(new CallService());

    return () => {
      if(callService)
      callService.end();
    }
  }, []);

  useEffect(() => {
    const updateCallStatus = (state: string) => {
      setCallStatus(state);
    }
    const renderRemoteStream = (stream: MediaStream) => {
      audioRef.current.srcObject = stream;
      audioRef.current.play();
    }
    const renderLocalStream = (stream: MediaStream) => {
      console.log("local stream added");
    }

    const onInvitation = (data: any) => {
      console.log("Got invitation");
      // get stream and we can pass the stream while accepting or we can pass the constrains
      // callService.accept({ stream: localstream });
      // callService.reject();
    }

    const onRefer = (data: any) => {
      console.log("Got refere");
    }

    const onEnded = () =>{
      setCallStatus('ended')
    }
    if (callService) {
      callService.once('state', updateCallStatus);
      callService.once('remoteStream', renderRemoteStream);
      callService.once('localStream', renderLocalStream);
      callService.once('onInvitation', onInvitation);
      callService.once('onRefer', onRefer);
      callService.once('ended', onEnded);
      
    }
    return () => {
      if (!callService) return;
      callService.off('state', updateCallStatus);
      callService.off('remoteStream', renderRemoteStream);
      callService.off('localStream', renderLocalStream);
      callService.off('onInvitation', onInvitation);
      callService.off('onRefer', onRefer);
      callService.off('ended', onEnded);
    }
  }, [callService, audioRef])

  const register = () => {
    const registrationData: RegistrationData = {
      proxyAddress: process.env.PROXY_ADDRESS,
      exNumber: parseInt(process.env.EX_NUMBER),
      userName: process.env.USERNAME,
      password: process.env.PASSWORD,
      sipJslogLevel: process.env.SIPJS_LOG_LEVEL as LogLevel,
      wsUrl: process.env.WS_URL
    }
    callService.register(registrationData);
  }

  const call = () => {
    const options : CallOptions = {
      number: parseInt(process.env.CALL_TO),
      media: { audio: true, video: false }
    }
    // here in the media you can pass our own stream  to trigger a call with that stream.
    callService.call(options);
  }

  const disconnect = () => {
    callService.disconnect();
  }
  const reconnect = async () => {
    callService.reconnect();
  }

  const endCall = () => {
    audioRef.current.srcObject = undefined;
    callService.end();
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
        <audio ref={audioRef} autoPlay />
      </div>
    </>
  )
}

export default App;