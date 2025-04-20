import React, { useEffect, useRef, useState } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import * as THREE from "three";

const App = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const threeCanvasRef = useRef(null);
  const [poseLandmarker, setPoseLandmarker] = useState(null);
  const [exercise, setExercise] = useState(null);
  const [formFeedback, setFormFeedback] = useState([]);

  useEffect(() => {
    const loadPoseLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
      );

      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });

      setPoseLandmarker(landmarker);
    };

    loadPoseLandmarker();
  }, []);

  useEffect(() => {
    if (!poseLandmarker || !exercise) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const threeCanvas = threeCanvasRef.current;

    const startCamera = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => resolve();
      });

      video.play();

      const width = video.videoWidth;
      const height = video.videoHeight;

      canvas.width = width;
      canvas.height = height;
      threeCanvas.width = width;
      threeCanvas.height = height;

      const threeRenderer = new THREE.WebGLRenderer({
        canvas: threeCanvas,
        alpha: true,
      });
      threeRenderer.setSize(width, height);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(0, width, height, 0, 1, 1000);
      camera.position.z = 10;

      const arrows = [];

      const detect = async () => {
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          requestAnimationFrame(detect);
          return;
        }

        const now = performance.now();
        const results = await poseLandmarker.detectForVideo(video, now);

        ctx.clearRect(0, 0, width, height);
        scene.clear();
        arrows.length = 0;

        if (results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const drawingUtils = new DrawingUtils(ctx);

          const { badPoints, feedbackMessages } = checkExerciseForm(landmarks, exercise);
          setFormFeedback(feedbackMessages);

          drawingUtils.drawLandmarks(landmarks, {
            color: (data, index) => (badPoints.includes(index) ? "red" : "green"),
            lineWidth: 4,
          });

          drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
            color: "gray",
            lineWidth: 2,
          });

          badPoints.forEach((index) => {
            const joint = landmarks[index];
            const x = joint.x * width;
            const y = joint.y * height;

            const dir = new THREE.Vector3(0, -1, 0);
            const origin = new THREE.Vector3(x, y, 0);
            const length = 40;
            const color = 0xff0000;

            const arrowHelper = new THREE.ArrowHelper(dir, origin, length, color);
            scene.add(arrowHelper);
            arrows.push(arrowHelper);
          });

          threeRenderer.render(scene, camera);
        }

        requestAnimationFrame(detect);
      };

      detect();
    };

    startCamera();
  }, [poseLandmarker, exercise]);

  const checkExerciseForm = (landmarks, exerciseType) => {
    const badPoints = [];
    const feedbackMessages = [];

    const getAngle = (A, B, C) => {
      const AB = [B.x - A.x, B.y - A.y];
      const CB = [B.x - C.x, B.y - C.y];
      const dot = AB[0] * CB[0] + AB[1] * CB[1];
      const magAB = Math.sqrt(AB[0] ** 2 + AB[1] ** 2);
      const magCB = Math.sqrt(CB[0] ** 2 + CB[1] ** 2);
      return (Math.acos(dot / (magAB * magCB)) * 180) / Math.PI;
    };

    if (exerciseType === "squats") {
      const backAngle = getAngle(landmarks[12], landmarks[24], landmarks[26]);
      const kneeAngle = getAngle(landmarks[24], landmarks[26], landmarks[28]);

      if (backAngle < 100) {
        badPoints.push(12, 24);
        feedbackMessages.push("Keep your back straighter.");
      }

      if (kneeAngle > 120) {
        badPoints.push(26, 28);
        feedbackMessages.push("Don't bend your knees too much.");
      }

      if (kneeAngle < 60) {
        badPoints.push(26, 28);
        feedbackMessages.push("Try to bend knees more.");
      }
    }

    if (exerciseType === "pushups") {
      const elbowAngle = getAngle(landmarks[12], landmarks[14], landmarks[16]);
      const hipAngle = getAngle(landmarks[24], landmarks[26], landmarks[28]);

      if (elbowAngle > 160 || elbowAngle < 70) {
        badPoints.push(14, 16);
        feedbackMessages.push("Maintain proper elbow angle during push-ups.");
      }

      if (hipAngle < 160) {
        badPoints.push(24, 26);
        feedbackMessages.push("Keep your hips aligned with your torso.");
      }
    }

    return { badPoints, feedbackMessages };
  };

  return (
    <div className="flex flex-col items-center p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Real-Time Exercise Evaluator</h1>

      <div className="flex gap-4 mb-6">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
          onClick={() => setExercise("squats")}
        >
          Start Squats
        </button>
        <button
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded"
          onClick={() => setExercise("pushups")}
        >
          Start Push-Ups
        </button>
      </div>

      <div className="mb-4 w-full max-w-lg">
        {exercise && (
          <>
            <h2 className="text-xl font-semibold mb-2">Feedback</h2>
            {formFeedback.length === 0 ? (
              <p className="text-green-600 font-medium">Perfect form! Keep going 💪</p>
            ) : (
              <ul className="list-disc list-inside text-red-600 space-y-1">
                {formFeedback.map((msg, index) => (
                  <li key={index}>{msg}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="relative w-[640px] h-[480px] border rounded overflow-hidden shadow-lg">
        <video
          ref={videoRef}
          className="absolute top-0 left-0 w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />
        <canvas
          ref={threeCanvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />
      </div>
    </div>
  );
};

export default App;

