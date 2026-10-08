import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./Watch.css";
import { api } from "../api";

function Watch() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ======================================================
  // VIDEO DATA STATE
  // ======================================================

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoExpired, setVideoExpired] = useState(false);

  // ======================================================
  // VIDEO PLAYER REFS
  // ======================================================

  const videoRef = useRef(null);
  const progressRef = useRef(null);
  const controlsTimerRef = useRef(null);

  // ======================================================
  // VIDEO PLAYER STATE
  // ======================================================

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // ======================================================
  // FETCH VIDEO
  // ======================================================

  useEffect(() => {
    let cancelled = false;

    const fetchVideo = async () => {
      try {
        setLoading(true);
        setError("");
        setVideoExpired(false);
        setVideo(null);

        console.log("=================================");
        console.log("LOADING VIDEO");
        console.log("VIDEO ID:", id);
        console.log("=================================");

        if (!id) {
          setError("Video ID is missing.");
          return;
        }

        // ==================================================
        // GET VIDEO FROM BACKEND
        // ==================================================

        const url = api(`/api/videos/${id}`);

        console.log("VIDEO API URL:", url);

        const response = await fetch(url, {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        });

        let data = {};

        try {
          data = await response.json();
        } catch {
          data = {};
        }

        console.log("VIDEO API STATUS:", response.status);
        console.log("VIDEO API RESPONSE:", data);

        if (cancelled) {
          return;
        }

        // ==================================================
        // VIDEO NOT FOUND
        // ==================================================

        if (response.status === 404) {
          setVideoExpired(true);
          return;
        }

        // ==================================================
        // OTHER BACKEND ERROR
        // ==================================================

        if (!response.ok) {
          throw new Error(data?.message || "Failed to load video from server.");
        }

        // ==================================================
        // IMPORTANT
        //
        // Backend returns:
        //
        // {
        //   success: true,
        //   video: {...}
        // }
        //
        // Therefore use data.video
        // ==================================================

        if (!data?.video) {
          console.error("VIDEO OBJECT MISSING:", data);

          throw new Error("The server did not return valid video information.");
        }

        console.log("VIDEO OBJECT:", data.video);

        setVideo(data.video);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("FETCH VIDEO ERROR:", error);

        setError(error.message || "Failed to load video.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchVideo();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // ======================================================
  // CLEANUP CONTROL TIMER
  // ======================================================

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    };
  }, []);

  // ======================================================
  // AUTO HIDE CONTROLS
  // ======================================================

  const showPlayerControls = () => {
    setShowControls(true);

    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }

    if (videoRef.current && !videoRef.current.paused) {
      controlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
        setShowSettings(false);
      }, 3000);
    }
  };

  // ======================================================
  // PLAY / PAUSE
  // ======================================================

  const togglePlay = async () => {
    const videoElement = videoRef.current;

    if (!videoElement || videoExpired) {
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

      setError("The video could not start playing. Please try again.");
    }
  };

  // ======================================================
  // VIDEO PLAY
  // ======================================================

  const handlePlay = () => {
    if (videoExpired) {
      return;
    }

    setPlaying(true);
    setShowControls(true);

    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }

    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
      setShowSettings(false);
    }, 3000);
  };

  // ======================================================
  // VIDEO PAUSE
  // ======================================================

  const handlePause = () => {
    setPlaying(false);

    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }

    setShowControls(true);
  };

  // ======================================================
  // VIDEO METADATA
  // ======================================================

  const handleLoadedMetadata = () => {
    const videoElement = videoRef.current;

    if (!videoElement || videoExpired) {
      return;
    }

    const duration = videoElement.duration;

    console.log("VIDEO METADATA LOADED");
    console.log("DURATION:", duration);
    console.log("VIDEO SRC:", videoElement.currentSrc);

    if (Number.isFinite(duration) && duration > 0) {
      setVideoDuration(duration);
    }
  };

  // ======================================================
  // TIME UPDATE
  // ======================================================

  const handleTimeUpdate = () => {
    const videoElement = videoRef.current;

    if (!videoElement || videoExpired) {
      return;
    }

    setCurrentTime(videoElement.currentTime || 0);
  };

  // ======================================================
  // VIDEO ENDED
  // ======================================================

  const handleVideoEnded = () => {
    setPlaying(false);

    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }

    setShowControls(true);
    setShowSettings(false);
  };

  // ======================================================
  // VIDEO ERROR
  // ======================================================

  const handleVideoError = () => {
    const videoElement = videoRef.current;
    const mediaError = videoElement?.error;

    console.error("=================================");
    console.error("VIDEO PLAYER ERROR");
    console.error("=================================");

    console.error("ERROR CODE:", mediaError?.code);
    console.error("ERROR MESSAGE:", mediaError?.message);
    console.error("CURRENT SRC:", videoElement?.currentSrc);
    console.error("VIDEO:", video);

    setPlaying(false);

    // --------------------------------------------------
    // MediaError codes
    //
    // 1 = ABORTED
    // 2 = NETWORK
    // 3 = DECODE
    // 4 = SRC_NOT_SUPPORTED
    // --------------------------------------------------

    if (!mediaError) {
      setError("Unable to play this video.");
      return;
    }

    switch (mediaError.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        setError("Video playback was interrupted.");
        break;

      case MediaError.MEDIA_ERR_NETWORK:
        setError("A network error occurred while loading the video.");
        break;

      case MediaError.MEDIA_ERR_DECODE:
        setError("The video could not be decoded by your browser.");
        break;

      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        setError(
          "The video format is not supported or the video file could not be loaded.",
        );
        break;

      default:
        setError("Unable to play this video.");
        break;
    }
  };

  // ======================================================
  // FORMAT TIME
  // ======================================================

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

  // ======================================================
  // SEEK
  // ======================================================

  const handleSeek = (event) => {
    const value = Number(event.target.value);

    const videoElement = videoRef.current;

    if (!videoElement || videoExpired) {
      return;
    }

    if (!Number.isFinite(value)) {
      return;
    }

    videoElement.currentTime = value;

    setCurrentTime(value);

    showPlayerControls();
  };

  // ======================================================
  // SKIP
  // ======================================================

  const skip = (seconds) => {
    const videoElement = videoRef.current;

    if (!videoElement || videoExpired) {
      return;
    }

    const duration = videoElement.duration || 0;

    const newTime = Math.max(
      0,
      Math.min(duration, videoElement.currentTime + seconds),
    );

    videoElement.currentTime = newTime;

    setCurrentTime(newTime);

    showPlayerControls();
  };

  // ======================================================
  // VOLUME
  // ======================================================

  const handleVolume = (event) => {
    const value = Number(event.target.value);

    const videoElement = videoRef.current;

    if (!videoElement || videoExpired) {
      return;
    }

    if (!Number.isFinite(value)) {
      return;
    }

    videoElement.volume = value;

    if (value > 0) {
      videoElement.muted = false;
      setMuted(false);
    }

    setVolume(value);

    showPlayerControls();
  };

  // ======================================================
  // MUTE
  // ======================================================

  const toggleMute = () => {
    const videoElement = videoRef.current;

    if (!videoElement || videoExpired) {
      return;
    }

    videoElement.muted = !videoElement.muted;

    setMuted(videoElement.muted);

    showPlayerControls();
  };

  // ======================================================
  // PLAYBACK SPEED
  // ======================================================

  const changePlaybackRate = (rate) => {
    const videoElement = videoRef.current;

    if (!videoElement || videoExpired) {
      return;
    }

    videoElement.playbackRate = rate;

    setPlaybackRate(rate);

    setShowSettings(false);

    showPlayerControls();
  };

  // ======================================================
  // FULLSCREEN
  // ======================================================

  const toggleFullscreen = async () => {
    const wrapper = document.querySelector(".custom-video-player");

    if (!wrapper || videoExpired) {
      return;
    }

    try {
      if (!document.fullscreenElement) {
        await wrapper.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("FULLSCREEN ERROR:", error);
    }

    showPlayerControls();
  };

  // ======================================================
  // FULLSCREEN CHANGE
  // ======================================================

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));

      if (document.fullscreenElement) {
        showPlayerControls();
      } else {
        setShowControls(true);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // ======================================================
  // KEYBOARD CONTROLS
  // ======================================================

  useEffect(() => {
    const handleKeyboard = (event) => {
      const target = event.target;

      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "BUTTON"
      ) {
        return;
      }

      if (!videoRef.current || videoExpired) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          event.preventDefault();

          togglePlay();

          showPlayerControls();

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
  }, [videoExpired]);

  // ======================================================
  // LOADING SCREEN
  // ======================================================

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

  // ======================================================
  // VIDEO NOT FOUND
  // ======================================================

  if (videoExpired) {
    return (
      <main className="watch-page">
        <div className="watch-container">
          <header className="watch-header">
            <button className="back-button" onClick={() => navigate("/")}>
              ←<span>Back</span>
            </button>

            <div className="watch-brand">
              <div className="watch-logo">▶</div>
            </div>
          </header>

          <section className="watch-card">
            <div className="watch-error video-expired-error">
              <div className="error-circle">!</div>

              <h2>Video Not Available</h2>

              <p>The video could not be found on the server.</p>

              <p>Please contact the admin if you believe this is an error.</p>

              <button onClick={() => navigate("/")}>← Back to Home</button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // ======================================================
  // GENERAL ERROR
  // ======================================================

  if (error) {
    return (
      <main className="watch-page">
        <div className="watch-error">
          <div className="error-circle">!</div>

          <h2>Unable to load video</h2>

          <p>{error}</p>

          <button onClick={() => window.location.reload()}>Try Again</button>

          <button onClick={() => navigate("/")}>← Back to Home</button>
        </div>
      </main>
    );
  }

  // ======================================================
  // NO VIDEO
  // ======================================================

  if (!video) {
    return (
      <main className="watch-page">
        <div className="watch-error">
          <div className="error-circle">!</div>

          <h2>Video not found</h2>

          <p>The video information could not be loaded.</p>

          <button onClick={() => navigate("/")}>← Back to Home</button>
        </div>
      </main>
    );
  }

  // ======================================================
  // VIDEO INFORMATION
  // ======================================================

  const duration = Number(video.duration || 0);

  const displayDuration = videoDuration > 0 ? videoDuration : duration;

  const format = (video.format || "mp4").toUpperCase();

  const progressPercentage =
    displayDuration > 0
      ? Math.min(100, Math.max(0, (currentTime / displayDuration) * 100))
      : 0;

  // ======================================================
  // STREAM URL
  // ======================================================

  const streamUrl = api(`/api/videos/stream/${video._id}`);

  // console.log("STREAM URL:", streamUrl); this will get url with numbers

  // ======================================================
  // PLAYER
  // ======================================================

  return (
    <main className="watch-page">
      <div className="watch-container">
        {/* ==================================================
            HEADER
        ================================================== */}

        <header className="watch-header">
          <button className="back-button" onClick={() => navigate("/")}>
            ←<span>Back</span>
          </button>

          <div className="watch-brand">
            <div className="watch-logo">▶</div>
          </div>
        </header>

        {/* ==================================================
            VIDEO CARD
        ================================================== */}

        <section className="watch-card">
          {/* ==================================================
              CUSTOM VIDEO PLAYER
          ================================================== */}

          <div
            className={`custom-video-player ${
              fullscreen ? "is-fullscreen" : ""
            }`}
            onMouseMove={showPlayerControls}
            onTouchStart={showPlayerControls}
          >
            {/* ==================================================
                VIDEO
            ================================================== */}

            <video
              ref={videoRef}
              className="video-player"
              preload="metadata"
              /*
               * IMPORTANT:
               *
               * Use api() here.
               *
               * Backend:
               * /api/videos/stream/:id
               */
              src={streamUrl}
              controls={false}
              controlsList="nodownload"
              disablePictureInPicture
              playsInline
              onPlay={handlePlay}
              onPause={handlePause}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleVideoEnded}
              onError={handleVideoError}
              onClick={() => {
                togglePlay();
                showPlayerControls();
              }}
            />

            {/* ==================================================
                CENTER PLAY BUTTON
            ================================================== */}

            {!playing && !videoExpired && (
              <button
                className="center-play-button"
                onClick={togglePlay}
                onTouchStart={showPlayerControls}
                aria-label="Play video"
              >
                <span className="center-play-icon">▶</span>
              </button>
            )}

            {/* ==================================================
                CONTROLS
            ================================================== */}

            {!videoExpired && (
              <div
                className={`player-controls ${
                  showControls ? "controls-visible" : "controls-hidden"
                }`}
                onClick={(event) => {
                  event.stopPropagation();

                  showPlayerControls();
                }}
                onTouchStart={(event) => {
                  event.stopPropagation();

                  showPlayerControls();
                }}
              >
                {/* ==================================================
                    PROGRESS
                ================================================== */}

                <div className="progress-container">
                  <input
                    ref={progressRef}
                    className="video-progress"
                    type="range"
                    min="0"
                    max={displayDuration || 0}
                    step="0.1"
                    value={Math.min(currentTime, displayDuration || 0)}
                    onChange={handleSeek}
                    style={{
                      "--progress": `${progressPercentage}%`,
                    }}
                  />
                </div>

                {/* ==================================================
                    BOTTOM CONTROLS
                ================================================== */}

                <div className="controls-row">
                  {/* ==================================================
                      LEFT CONTROLS
                  ================================================== */}

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

                  {/* ==================================================
                      RIGHT CONTROLS
                  ================================================== */}

                  <div className="controls-right">
                    {/* SETTINGS */}

                    <div className="settings-container">
                      <button
                        className="player-button settings-button"
                        onClick={() => {
                          setShowSettings((current) => !current);

                          showPlayerControls();
                        }}
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
                      ⛶
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ==================================================
              VIDEO INFORMATION
          ================================================== */}

          <div className="video-info">
            <div className="video-title-section">
              <span className="video-label">VIDEO</span>

              <h1>{video.title}</h1>
            </div>

            <div className="video-details">
              {/* ==================================================
                  DURATION
              ================================================== */}

              <div className="video-detail">
                <div className="detail-icon duration-icon">◷</div>

                <div>
                  <span>Duration</span>

                  <strong>{formatTime(displayDuration)}</strong>
                </div>
              </div>

              {/* ==================================================
                  FORMAT
              ================================================== */}

              <div className="video-detail">
                <div className="detail-icon format-icon">▣</div>

                <div>
                  <span>Format</span>

                  <strong>{format}</strong>
                </div>
              </div>

              {/* ==================================================
                  CBC
              ================================================== */}

              <div className="video-detail">
                <div className="detail-icon cbc-icon">CBC</div>

                <div>
                  <p>
                    <strong>{video.cbc || "N/A"}</strong>

                    <span> Rating</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================================================
            FOOTER
        ================================================== */}

        <footer className="watch-footer">
          <span className="online-dot"></span>
          Video is ready to watch
        </footer>
      </div>
    </main>
  );
}

export default Watch;
