import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ExplosionEffectProps {
  showExplosion: { x: number, y: number } | null;
  stageScale: number;
  stagePos: { x: number, y: number };
}

const ExplosionEffect: React.FC<ExplosionEffectProps> = ({ showExplosion, stageScale, stagePos }) => {
  return (
    <AnimatePresence>
      {showExplosion && (
        <div 
          className="absolute z-[1000] pointer-events-none"
          style={{ 
            left: (showExplosion.x * stageScale + stagePos.x), 
            top: (showExplosion.y * stageScale + stagePos.y),
            transform: 'translate(-50%, -50%)'
          }}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: [0, 1.2, 2.5], 
              opacity: [0, 1, 0],
              rotate: [0, 45, 90]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-32 h-32 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-yellow-400 rounded-full blur-xl opacity-50" />
            <div className="absolute inset-4 bg-orange-500 rounded-full blur-lg opacity-70" />
            <div className="absolute inset-8 bg-white rounded-full blur-md" />
            
            {/* Particle sparks */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ 
                  x: Math.cos(i * 45 * Math.PI / 180) * 100,
                  y: Math.sin(i * 45 * Math.PI / 180) * 100,
                  opacity: 0,
                  scale: 0
                }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="absolute w-2 h-2 bg-yellow-200 rounded-full"
              />
            ))}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ExplosionEffect;
