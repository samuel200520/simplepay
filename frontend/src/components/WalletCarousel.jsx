import React, { useState, useRef, useCallback, useEffect } from 'react';
import WalletCard from './WalletCard';

export default function WalletCarousel({ wallets, onSelect, selectedId }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef(null);

  const scrollTo = useCallback((index) => {
    if (index < 0 || index >= wallets.length) return;
    setCurrentIndex(index);
    if (containerRef.current) {
      const card = containerRef.current.children[index];
      if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [wallets.length]);

  useEffect(() => {
    if (wallets.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % wallets.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [wallets.length]);

  useEffect(() => {
    if (containerRef.current) {
      const card = containerRef.current.children[currentIndex];
      if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [currentIndex]);

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

      {/* Cards container */}
      <div
        ref={containerRef}
        style={styles.track}
      >
        {wallets.map((w, i) => (
          <div
            key={w.id}
            style={{
              ...styles.cardWrapper,
              transform: `scale(${i === currentIndex ? 1 : 0.92})`,
              opacity: i === currentIndex ? 1 : 0.5,
              transition: 'transform 0.3s, opacity 0.3s',
            }}
            onClick={() => {
              scrollTo(i);
              if (onSelect) onSelect(w);
            }}
          >
            <WalletCard wallet={w} active={i === currentIndex || w.id === selectedId} />
          </div>
        ))}
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
    overflow: 'hidden',
  },
  track: {
    display: 'flex',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    gap: '16px',
    padding: '8px 0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWrapper: {
    flexShrink: 0,
    width: '320px',
    scrollSnapAlign: 'center',
    cursor: 'pointer',
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
