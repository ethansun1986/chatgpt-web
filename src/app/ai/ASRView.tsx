import { useToast } from '@chakra-ui/react';
import { useMemoizedFn } from 'ahooks';
import sha256 from 'crypto-js/sha256';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';

import { buffer2pcm, createRecorder } from '../../utils/Recorder';
import type { AudioProcessFn, RecorderType } from '../../utils/RecorderType';
import { request } from '../utils';
import { APP_CONFIG, ASR_CONFIG, getUnisoundKeySecret } from './Config';

export interface ASRRef {
  start: () => void;
  stop: () => void;
}

interface Props {
  onResultChange?: (v: string, changing: boolean) => void;
  onStatusChange?: (recording: boolean) => void;
  config?: Record<string, any>;

  onBuffer?: (v: Int16Array[]) => void;
}

const langArr = ['cn', 'sichuanese', 'cantonese', 'en'];

export const ASRView = React.forwardRef<ASRRef, Props>((props, ref) => {
  const toast = useToast({ position: 'top', isClosable: true });
  const { onStatusChange, onResultChange, onBuffer } = props;

  const [currentLang] = useState(0);

  const recorderRef = useRef<RecorderType | null>();
  const socketRef = useRef<WebSocket | null>();

  const errorCountRef = useRef(0);
  const retryRef = useRef<any>();
  const closeRef = useRef(false);

  useImperativeHandle(
    ref,
    () => {
      return { start, stop };
    },
    [],
  );

  useEffect(() => {
    return () => {
      closeRef.current = true;
      stopRecording();
    };
  }, []);

  const stop = useMemoizedFn(() => {
    stopRecording();
  });

  const start = useMemoizedFn(() => {
    startRecording();
  });

  function startRecording() {
    onStatusChange?.(true);
    doStartRecording();
  }

  function stopRecording() {
    doStopRecording(true);
    onStatusChange?.(false);
  }

  function doStartRecording() {
    doStopRecording(false);
    if (recorderRef.current) {
      createSocket();
      return;
    }
    const recorder = createRecorder(onAudioProcess);
    recorderRef.current = recorder;
    recorder.open(
      () => {
        console.log('recorder ready ...');
        recorder.start();
        createSocket();
      },
      (msg) => {
        toast({ status: 'error', title: '录音启动失败 ', description: msg });
        console.error('录音启动失败: ' + msg);
        socketRef.current?.close();
        onStatusChange?.(false);
      },
    );
  }

  async function createSocket() {
    let sid: string;

    const chatConfig = getUnisoundKeySecret();
    const appKey = chatConfig.KEY;
    const secret = chatConfig.SECRET;
    const path = ASR_CONFIG.SOCKET_URL;
    const time: number = Date.now();
    let sign: string;
    if (secret) {
      sign = sha256(`${appKey}${time}${secret}`).toString().toUpperCase();
    } else {
      try {
        const response = await request('/api/unisound', {
          method: 'POST',
          body: JSON.stringify({ key: appKey, time }),
        });
        if (!response.ok) {
          const json = await response.json();
          throw new Error(json?.error?.code);
        }
        const json = await response.json();
        sign = json.sign;
      } catch (error: any) {
        console.log(error);
        toast({ status: 'error', title: error.message || 'asr sign error' });
        return;
      }
    }

    const socket = new WebSocket(`${path}?appkey=${appKey}&time=${time}&sign=${sign}`);
    socketRef.current = socket;
    socket.addEventListener('open', () => {
      console.log('!!! socket open !!!');
      errorCountRef.current = 0;
      socket.send(
        JSON.stringify({
          type: 'start',
          sha: '256',
          data: {
            lang: langArr[currentLang],
            appkey: appKey,
            userId: APP_CONFIG.USER_ID,
            udid: APP_CONFIG.UDID,
          },
        }),
      );
    });

    socket.addEventListener('message', (e) => {
      const res = JSON.parse(e.data);
      if (res.code === 0 && res.text) {
        sid = res.sid;
        const { text } = res;
        onResultChange?.(text, res.type === 'variable');
      } else {
        console.log('asr record end !', [closeRef.current], res, [new Date().toLocaleTimeString()]);
        if (closeRef.current) return;
        doStartRecording();
      }
    });

    socket.addEventListener('error', (e) => {
      console.log('asr ws error', sid, [new Date().toLocaleTimeString()]);
      console.log(e);
      socketRef.current = null;
      retry();
    });

    socket.addEventListener('close', (e) => {
      console.log('asr ws close', [sid], [new Date().toLocaleTimeString()]);
      console.log(e);
      socketRef.current = null;
      if (e.code !== 1000) {
        if (closeRef.current) return;
        retry();
      }
    });
  }

  function retry() {
    errorCountRef.current = errorCountRef.current + 1;
    clearRetryTimeout();
    retryRef.current = setTimeout(doStartRecording, errorCountRef.current * 200);
  }

  function clearRetryTimeout() {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = undefined;
    }
  }

  const onAudioProcess: AudioProcessFn = (buffers, powerLevel, bufferDuration, bufferSampleRate, newBufferIdx) => {
    const newBuffers = buffers.slice(newBufferIdx);
    onBuffer?.(newBuffers);
    const socket = socketRef.current;
    // console.log('onAudioProcess():', socket?.readyState, new Date());

    if (socket && socket.readyState === 1) {
      socket.send(buffer2pcm(newBuffers, bufferSampleRate));
      // console.log('buffers', [bufferSampleRate, bufferDuration]);
      // console.log('newBuffers', buffers.length, newBuffers.length, pcm.length);
    }
  };

  function doStopRecording(closeRecorder = true) {
    retryRef.current && clearTimeout(retryRef.current);
    if (closeRecorder) {
      recorderRef.current?.close();
      recorderRef.current = null;
    }
    const socket = socketRef.current;
    if (socket) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'end' }));
      }
      socket.close();
    }
  }

  return null;
});
