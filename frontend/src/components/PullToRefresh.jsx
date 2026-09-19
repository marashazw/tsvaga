import React, { useRef, useState } from 'react';

const PULL_THRESHOLD = 70; // px of pull needed to trigger a refresh
const MAX_PULL = 90; // visual cap on how far the indicator area can grow

// Wraps the app's main content and adds a swipe-down-from-the-top gesture
// that triggers onRefresh - a safety net alongside the automatic
// foreground-refresh logic already in place, for the rare case something
// still doesn't update on its own. Only engages when the page is already
// scrolled to the very top, so it never interferes with normal scrolling
// anywhere else.
export default function PullToRefresh({ onRefresh, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const pulling = useRef(false);

  function handleTouchStart(e) {
    if (window.scrollY === 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }

  function handleTouchMove(e) {
    if (!pulling.current || startY.current === null) return;
    const distance = e.touches[0].clientY - startY.current;
    if (distance > 0) {
      // Dampened (0.5x) so the drag feels natural rather than 1:1 with the
      // finger, matching how native pull-to-refresh gestures typically feel.
      setPullDistance(Math.min(distance * 0.5, MAX_PULL));
    } else {
      pulling.current = false;
      setPullDistance(0);
    }
  }

  async function handleTouchEnd() {
    if (!pulling.current) return;
    pulling.current = false;
    startY.current = null;
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD); // hold the indicator in place while the refresh runs
      try {
        await onRefresh();
      } catch (err) {
        // A failed refresh isn't worth surfacing as an error here - the
        // person can just try again, same as any other transient network hiccup.
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }

  const showIndicator = pullDistance > 0 || refreshing;
  const readyToRelease = pullDistance >= PULL_THRESHOLD;

  return (
    <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <style>{`
        @keyframes pull-refresh-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          height: refreshing ? PULL_THRESHOLD : pullDistance,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition: pulling.current ? 'none' : 'height 0.2s ease',
        }}
      >
        {showIndicator && (
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: '2.5px solid #d8cdb9',
              borderTopColor: 'var(--forest)',
              transform: refreshing ? 'none' : `rotate(${readyToRelease ? 180 : pullDistance * 2}deg)`,
              animation: refreshing ? 'pull-refresh-spin 0.7s linear infinite' : 'none',
              transition: 'transform 0.1s linear',
            }}
          />
        )}
      </div>
      {children}
    </div>
  );
}
