import React, { useState, useCallback, useEffect } from 'react';
import WalletCard from './WalletCard';

export default function WalletCarousel({ wallets, onSelect, selectedId }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const scrollTo = useCallback((index) => {
    if (index < 0 || index >= wallets.length) return;
    setCurrentIndex(index);
  }, [wallets.length]);

  useEffect(() => {
    if (wallets.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % wallets.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [wallets.length]);

  if (!wallets || wallets.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyCard}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>💳</div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#888' }}>No wallets yet</div>
          <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>Link an account to get started</div>
        </div>
      </div>
    );
  }

  const prevIndex = (currentIndex - 1 + wallets.length) % wallets.length;
  const nextIndex = (currentIndex + 1) % wallets.length;

  return (
    <div style={styles.wrapper}>
      {/* Arrows */}
      {wallets.length > 1 && (
        <>
          <button
            style={{ ...styles.arrow, left: 0, opacity: currentIndex > 0 ? 1 : 0.2 }}
            disabled={currentIndex <= 0}
            onClick={() => scrollTo(currentIndex - 1)}
            aria-label="Previous wallet"
          >
            ‹
          </button>
          <button
            style={{ ...styles.arrow, right: 0, opacity: currentIndex < wallets.length - 1 ? 1 : 0.2 }}
            disabled={currentIndex >= wallets.length - 1}
            onClick={() => scrollTo(currentIndex + 1)}
            aria-label="Next wallet"
          >
            ›
          </button>
        </>
      )}

      {/* Stacked cards */}
      <div style={styles.stackContainer}>
        {wallets.map((w, i) => {
          const isCurrent = i === currentIndex || w.id === selectedId;
          const isPrev = i === prevIndex;
          const isNext = i === nextIndex;
          const isVisible = isCurrent || isPrev || isNext;

          if (!isVisible && wallets.length > 3) return null;

          let zIndex = 0;
          let translateY = 0;
          let scale = 1;
          let opacity = 1;
          let rotateX = 0;

          if (isCurrent) {
            zIndex = 3;
            translateY = 0;
            scale = 1;
            opacity = 1;
            rotateX = 0;
          } else if (isPrev) {
            zIndex = 2;
            translateY = 70;
            scale = 0.92;
            opacity = 0.7;
            rotateX = 4;
          } else if (isNext) {
            zIndex = 1;
            translateY = -70;
            scale = 0.92;
            opacity = 0.7;
            rotateX = -4;
          } else {
            zIndex = 0;
            translateY = 140;
            scale = 0.85;
            opacity = 0.4;
            rotateX = 6;
          }

          return (
            <div
              key={w.id}
              style={{
                ...styles.cardWrapper,
                zIndex,
                transform: `translateY(${translateY}px) scale(${scale}) rotateX(${rotateX}deg)`,
                opacity,
                transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onClick={() => {
                scrollTo(i);
                if (onSelect) onSelect(w);
              }}
            >
              <WalletCard wallet={w} active={isCurrent} />
            </div>
          );
        })}
      </div>

      {/* Dot indicators */}
      {wallets.length > 1 && (
        <div style={styles.dots}>
          {wallets.map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                background: i === currentIndex ? '#fff' : 'rgba(255,255,255,0.3)',
                width: i === currentIndex ? '24px' : '8px',
              }}
              onClick={() => scrollTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    position: 'relative',
    padding: '12px 0',
    overflow: 'visible',
  },
  stackContainer: {
    position: 'relative',
    height: '340px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    perspective: '1000px',
  },
  cardWrapper: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: '-95px',
    marginLeft: '-160px',
    width: '320px',
    cursor: 'pointer',
    transformOrigin: 'center center',
    willChange: 'transform, opacity',
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 10,
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.3)',
    background: 'rgba(0,0,0,0.4)',
    color: 'white',
    fontSize: '22px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    lineHeight: 1,
  },
  dots: {
    display: 'flex',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '12px',
  },
  dot: {
    height: '8px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.3s',
  },
  empty: {
    padding: '24px 0',
    display: 'flex',
    justifyContent: 'center',
  },
  emptyCard: {
    textAlign: 'center',
    padding: '32px',
    background: '#f8f8f8',
    borderRadius: '16px',
    border: '2px dashed #ddd',
    width: '320px',
  },
};
