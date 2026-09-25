import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./Watch.css";

function Watch() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ==========================================
  // VIDEO PLAYER STATE
  // ==========================================

  const videoRef = useRef(null);
  const progressRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ==========================================
  // FETCH VIDEO
  // ==========================================

  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL;
        // const response = await fetch(`http://localhost:5000/api/videos/${id}`);

        const response = await fetch(`${API_URL}/api/videos/${id}`);

        const data = await response.json();

        console.log("VIDEO DATA:", data);

        if (!response.ok) {
          throw new Error(data.message || "Failed to load video");
        }

        setVideo(data);
      } catch (error) {
        console.error("FETCH VIDEO ERROR:", error);

        setError(error.message || "Failed to load video");
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [id]);

  // ==========================================
  // FORMAT TIME
  // ==========================================

  const formatTime = (seconds) => {
    const time = Number(seconds || 0);

    if (!Number.isFinite(time)) {
      return "0:00";
    }

    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const remainingSeconds = Math.floor(time % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
        .toString()
        .padStart(2, "0")}`;
    }

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  // ==========================================
  // PLAY / PAUSE
  // ==========================================

  const togglePlay = async () => {
    const videoElement = videoRef.current;

    if (!videoElement) {
      return;
    }

    try {
      if (videoElement.paused) {
        await videoElement.play();
      } else {
        videoElement.pause();
      }
    } catch (error) {
      console.error("PLAY ERROR:", error);
    }
  };

  // ==========================================
  // VIDEO EVENTS
  // ==========================================

  const handlePlay = () => {
    setPlaying(true);
  };

  const handlePause = () => {
    setPlaying(false);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) {
      return;
    }

    setVideoDuration(videoRef.current.duration || 0);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) {
      return;
    }

    setCurrentTime(videoRef.current.currentTime || 0);
  };

  // ==========================================
  // SEEK
  // ==========================================

  const handleSeek = (event) => {
    const value = Number(event.target.value);

    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = value;
    setCurrentTime(value);
  };

  // ==========================================
  // SKIP
  // ==========================================

  const skip = (seconds) => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = Math.max(
      0,
      Math.min(
        videoRef.current.duration || 0,
        videoRef.current.currentTime + seconds,
      ),
    );
  };

  // ==========================================
  // VOLUME
  // ==========================================

  const handleVolume = (event) => {
    const value = Number(event.target.value);

    if (!videoRef.current) {
      return;
    }

    videoRef.current.volume = value;

    if (value > 0) {
      videoRef.current.muted = false;
      setMuted(false);
    }

    setVolume(value);
  };

  // ==========================================
  // MUTE
  // ==========================================

  const toggleMute = () => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.muted = !videoRef.current.muted;

    setMuted(videoRef.current.muted);
  };

  // ==========================================
  // PLAYBACK SPEED
  // ==========================================

  const changePlaybackRate = (rate) => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.playbackRate = rate;

    setPlaybackRate(rate);
    setShowSettings(false);
  };

  // ==========================================
  // FULLSCREEN
  // ==========================================

  const toggleFullscreen = async () => {
    const wrapper = document.querySelector(".custom-video-player");

    if (!wrapper) {
      return;
    }

    try {
      if (!document.fullscreenElement) {
        await wrapper.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch (error) {
      console.error("FULLSCREEN ERROR:", error);
    }
  };

  // ==========================================
  // FULLSCREEN CHANGE
  // ==========================================

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // ==========================================
  // KEYBOARD CONTROLS
  // ==========================================

  useEffect(() => {
    const handleKeyboard = (event) => {
      // Don't interfere with inputs/buttons
      if (
        event.target.tagName === "INPUT" ||
        event.target.tagName === "TEXTAREA" ||
        event.target.tagName === "BUTTON"
      ) {
        return;
      }

      if (!videoRef.current) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();
          togglePlay();
          break;

        case "arrowleft":
          event.preventDefault();
          skip(-5);
          break;

        case "arrowright":
          event.preventDefault();
          skip(5);
          break;

        case "m":
          event.preventDefault();
          toggleMute();
          break;

        case "f":
          event.preventDefault();
          toggleFullscreen();
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyboard);

    return () => {
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, []);

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <main className="watch-page">
        <div className="watch-loading">
          <div className="watch-spinner"></div>

          <h2>Loading video...</h2>

          <p>Please wait while we prepare your video.</p>
        </div>
      </main>
    );
  }

  // ==========================================
  // ERROR
  // ==========================================

  if (error) {
    return (
      <main className="watch-page">
        <div className="watch-error">
          <div className="error-circle">!</div>

          <h2>Unable to load video</h2>

          <p>{error}</p>

          <button onClick={() => navigate("/")}>← Back to Home</button>
        </div>
      </main>
    );
  }

  // ==========================================
  // VIDEO NOT FOUND
  // ==========================================

  if (!video) {
    return (
      <main className="watch-page">
        <div className="watch-error">
          <div className="error-circle">!</div>

          <h2>Video not found</h2>

          <p>The video you're looking for doesn't exist.</p>

          <button onClick={() => navigate("/")}>← Back to Home</button>
        </div>
      </main>
    );
  }

  // ==========================================
  // VIDEO DATA
  // ==========================================

  const duration = Number(video.duration || 0);

  const displayDuration = videoDuration || duration;

  const sizeMB = Number(video.size || 0) / (1024 * 1024);

  const formattedSize =
    sizeMB >= 1024
      ? `${(sizeMB / 1024).toFixed(2)} GB`
      : `${sizeMB.toFixed(2)} MB`;

  const format = (video.format || "mp4").toUpperCase();

  const progressPercentage =
    displayDuration > 0
      ? Math.min(100, Math.max(0, (currentTime / displayDuration) * 100))
      : 0;

  // ==========================================
  // PLAYER
  // ==========================================

  return (
    <main className="watch-page">
      <div className="watch-container">
        {/* HEADER */}

        <header className="watch-header">
          <button className="back-button" onClick={() => navigate("/")}>
            ←<span>Back</span>
          </button>

          <div className="watch-brand">
            <div className="watch-logo">▶</div>

            {/* <span>Video Link App</span> */}
          </div>
        </header>

        {/* VIDEO CARD */}

        <section className="watch-card">
          {/* ======================================
              CUSTOM VIDEO PLAYER
          ====================================== */}

          <div
            className={`custom-video-player ${
              fullscreen ? "is-fullscreen" : ""
            }`}
          >
            <video
              ref={videoRef}
              className="video-player"
              preload="metadata"
              src={`http://localhost:5000/api/videos/stream/${video.id}`}
              controls={false}
              controlsList="nodownload"
              disablePictureInPicture
              onPlay={handlePlay}
              onPause={handlePause}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setPlaying(false)}
              onClick={togglePlay}
            />

            {/* CENTER PLAY BUTTON */}

            {!playing && (
              <button
                className="center-play-button"
                onClick={togglePlay}
                aria-label="Play video"
              >
                <span className="center-play-icon">▶</span>
              </button>
            )}

            {/* CONTROLS */}

            <div className="player-controls">
              {/* PROGRESS */}

              <div className="progress-container">
                <input
                  ref={progressRef}
                  className="video-progress"
                  type="range"
                  min="0"
                  max={displayDuration || 0}
                  step="0.1"
                  value={currentTime}
                  onChange={handleSeek}
                  style={{
                    "--progress": `${progressPercentage}%`,
                  }}
                />
              </div>

              {/* BOTTOM CONTROLS */}

              <div className="controls-row">
                <div className="controls-left">
                  {/* PLAY */}

                  <button
                    className="player-button"
                    onClick={togglePlay}
                    title={playing ? "Pause" : "Play"}
                  >
                    {playing ? "❚❚" : "▶"}
                  </button>

                  {/* BACK 5 */}

                  <button
                    className="player-button skip-button"
                    onClick={() => skip(-5)}
                    title="Back 5 seconds"
                  >
                    ↶
                  </button>

                  {/* FORWARD 5 */}

                  <button
                    className="player-button skip-button"
                    onClick={() => skip(5)}
                    title="Forward 5 seconds"
                  >
                    ↷
                  </button>

                  {/* VOLUME */}

                  <button
                    className="player-button"
                    onClick={toggleMute}
                    title={muted ? "Unmute" : "Mute"}
                  >
                    {muted || volume === 0 ? "🔇" : "🔊"}
                  </button>

                  <input
                    className="volume-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={muted ? 0 : volume}
                    onChange={handleVolume}
                    style={{
                      "--volume": `${(muted ? 0 : volume) * 100}%`,
                    }}
                  />

                  {/* TIME */}

                  <span className="player-time">
                    {formatTime(currentTime)} / {formatTime(displayDuration)}
                  </span>
                </div>

                <div className="controls-right">
                  {/* SETTINGS */}

                  <div className="settings-container">
                    <button
                      className="player-button settings-button"
                      onClick={() => setShowSettings(!showSettings)}
                      title="Settings"
                    >
                      ⚙
                    </button>

                    {showSettings && (
                      <div className="settings-menu">
                        <div className="settings-title">Playback speed</div>

                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                          <button
                            key={rate}
                            className={
                              playbackRate === rate
                                ? "settings-option active"
                                : "settings-option"
                            }
                            onClick={() => changePlaybackRate(rate)}
                          >
                            {rate === 1 ? "Normal" : `${rate}x`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* FULLSCREEN */}

                  <button
                    className="player-button"
                    onClick={toggleFullscreen}
                    title="Fullscreen"
                  >
                    {fullscreen ? "⛶" : "⛶"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* VIDEO INFORMATION */}

          <div className="video-info">
            <div className="video-title-section">
              <span className="video-label">VIDEO</span>

              <h1>{video.title}</h1>
            </div>

            <div className="video-details">
              {/* DURATION */}

              <div className="video-detail">
                <div className="detail-icon duration-icon">◷</div>

                <div>
                  <span>Duration</span>

                  <strong>{formatTime(displayDuration)}</strong>
                </div>
              </div>

              {/* FORMAT */}

              <div className="video-detail">
                <div className="detail-icon format-icon">▣</div>

                <div>
                  <span>Format</span>

                  <strong>{format}</strong>
                </div>
              </div>

              {/* CBC */}

              <div className="video-detail">
                <div className="detail-icon cbc-icon">CBC</div>

                <div>
                  <p>
                    <strong> {video.cbc || "N/A"} </strong>
                    <span> Rating </span>
                  </p>
                </div>
              </div>

              {/* SIZE */}

              {/* <div className="video-detail">
                <div className="detail-icon size-icon">⇩</div>

                <div>
                  <span>File Size</span>

                  <strong>{formattedSize}</strong>
                </div>
              </div> */}
            </div>

            {/* VIDEO URL */}

            {/* <div className="video-url-box">
              <span className="url-label">Video URL</span>

              <div className="url-row">
                <span className="video-url">{video.videoUrl}</span>

                <button
                  className="copy-button"
                  onClick={() => navigator.clipboard.writeText(video.videoUrl)}
                >
                  Copy
                </button>
              </div>
            </div> */}
          </div>
        </section>

        {/* FOOTER */}

        <footer className="watch-footer">
          <span className="online-dot"></span>
          Video is ready to watch
        </footer>
      </div>
    </main>
  );
}

export default Watch;
