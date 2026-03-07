import React, { useRef, useEffect } from 'react';

export default function HeroGlobe() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const numNodes = 60;
        const radius = 160;
        const focalLength = 350;
        const rotationSpeedY = 0.002;

        let nodes = [];
        let highlightedCount = 0;

        // Generate points on a sphere
        for (let i = 0; i < numNodes; i++) {
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);

            let isHighlighted = false;
            // 5 to 8 highlighted nodes
            if (highlightedCount < 8 && Math.random() > 0.8) {
                isHighlighted = true;
                highlightedCount++;
            }

            nodes.push({
                x: Math.sin(phi) * Math.cos(theta),
                y: Math.sin(phi) * Math.sin(theta),
                z: Math.cos(phi),
                isHighlighted,
                pulsePhase: Math.random() * Math.PI * 2
            });
        }

        // Ensure at least 5 highlighted if RNG didn't hit
        while (highlightedCount < 5) {
            const idx = Math.floor(Math.random() * numNodes);
            if (!nodes[idx].isHighlighted) {
                nodes[idx].isHighlighted = true;
                highlightedCount++;
            }
        }

        let angleY = 0;
        let animationFrameId;

        const render = () => {
            angleY += rotationSpeedY;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            // 3D Math Projection
            const transformedNodes = nodes.map(node => {
                // Rotation around Y axis
                const rotatedX = node.x * Math.cos(angleY) - node.z * Math.sin(angleY);
                let rotatedZ = node.x * Math.sin(angleY) + node.z * Math.cos(angleY);

                // Optional tilt by rotating around X to give it a globe angle (20 degrees)
                const tilt = 20 * (Math.PI / 180);
                const y = node.y * Math.cos(tilt) - rotatedZ * Math.sin(tilt);
                rotatedZ = node.y * Math.sin(tilt) + rotatedZ * Math.cos(tilt);

                const worldZ = rotatedZ * radius;
                const scale = focalLength / (focalLength + worldZ);

                return {
                    ...node,
                    rotatedX,
                    rotatedZ,
                    y, // tilted Y
                    screenX: centerX + rotatedX * radius * scale,
                    screenY: centerY + y * radius * scale,
                    scale,
                    alpha: Math.max(0.05, Math.min(1, 1 - (worldZ + radius) / (radius * 2.5)))
                };
            });

            // Draw lines connecting nearby nodes
            ctx.lineWidth = 0.5;
            for (let i = 0; i < transformedNodes.length; i++) {
                for (let j = i + 1; j < transformedNodes.length; j++) {
                    const n1 = transformedNodes[i];
                    const n2 = transformedNodes[j];

                    // 3D surface distance to avoid lines slicing through the globe
                    const dx = n1.rotatedX - n2.rotatedX;
                    const dy = n1.y - n2.y;
                    const dz = n1.rotatedZ - n2.rotatedZ;
                    const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz) * radius;

                    if (dist3D < 110) {
                        const alpha = 1 - (dist3D / 110);
                        const zAlpha = (n1.alpha + n2.alpha) / 2;
                        ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 * alpha * zAlpha})`;
                        ctx.beginPath();
                        ctx.moveTo(n1.screenX, n1.screenY);
                        ctx.lineTo(n2.screenX, n2.screenY);
                        ctx.stroke();
                    }
                }
            }

            // Draw nodes
            transformedNodes.sort((a, b) => b.rotatedZ - a.rotatedZ).forEach(node => {
                const pulse = Math.sin(Date.now() / 400 + node.pulsePhase) * 0.2 + 0.8;

                ctx.beginPath();
                ctx.arc(node.screenX, node.screenY, (node.isHighlighted ? 2.5 : 1.5) * node.scale * pulse, 0, Math.PI * 2);

                if (node.isHighlighted) {
                    ctx.fillStyle = `rgba(255, 215, 0, ${node.alpha})`; // Gold highlight
                    ctx.shadowColor = `rgba(255, 215, 0, ${node.alpha})`;
                    ctx.shadowBlur = 10 * node.scale;
                } else {
                    ctx.fillStyle = `rgba(168, 212, 245, ${node.alpha})`; // Light blue dots
                    ctx.shadowBlur = 0;
                }

                ctx.fill();
            });

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={400}
            height={400}
            style={{ width: '400px', height: '400px', background: 'transparent' }}
        />
    );
}
