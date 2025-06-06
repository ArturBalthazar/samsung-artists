let infoPanelOpen = false;
let tabletOn = false;
let tabletMesh = null;
let tabletSkeleton = null;
let tabletAnimGroup = null;
let firstTabletOpen = true;

let ground = null;
let grabbedItem = null;

let idleTimer = 0;
let lastMoveTime = performance.now();
let walkTime = 0;
let isWalking = false;

const inputMap = {};

const productMeshes = {}; // Store root containers by name
const productContainers = {};
const productList = ["apple", "banana", "fish", "petfood", "medicaldevice", "packedfood1", "packedfood2", "packedfood3", "drugs", "cosmetics"];
const emissionStrengths = {
    apple: 1,
    banana: 1,
    cosmetics: 0.3,
    drugs: 0.15,
    fish: 1,
    medicaldevice: 0.2,
    packedfood1: 0.3,
    packedfood2: 0.05,
    packedfood3: 1,
    petfood: 0.4
};

const originalEmissions = {}; // productName => [ { meshName, texture, color } ]


let currentOverlayPhotoId = null;

let audioManager = null;
let audioEnabled = true;
let audioWalking = null;
let audioPhoto = null;
let audioClick = null;
let audioAmbient = null;
let flyBuzz = null;

const anchorPoints = [];
const anchorButtons = [];
let anchorWrapper = null;
let currentInspectedProduct = null;

let thermRoot = null;
let thermMesh = null;
let thermAnimGroup = null;
let thermMaterial = null;
let thermScreenMat = null;
let thermScreenDT, thermScreenCtx, thermScreenSize;
let thermCurrentTemp = null;

let sample1Root = null;
let sample1AnimGroup = null;
let sample1Material = null;

let sample2Root = null;
let sample2AnimGroup = null;
let sample2Material = null;

let ratMesh = null;
let ratAnimGroup = null;
let currentRatIndex = 0;
let ratMaterial = null;

let tempF = null;
let hum = null;

window.addEventListener("DOMContentLoaded", async () => {
    const canvas = document.getElementById("renderCanvas");
    const engine = new BABYLON.Engine(canvas, true);
    const scene = new BABYLON.Scene(engine);
    console.log("✅ Scene and engine initialized");
    

    scene.actionManager = new BABYLON.ActionManager(scene);

    scene.onKeyboardObservable.add((kbInfo) => {
        const key = kbInfo.event.key;
        if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
            inputMap[key] = true;
        } else if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYUP) {
            inputMap[key] = false;
        }
    });

    // ✅ Ammo.js Physics V1
    await Ammo();
    const plugin = new BABYLON.AmmoJSPlugin();
    scene.enablePhysics(new BABYLON.Vector3(0, -0, 0), plugin);
    const ammoWorld = plugin.world;
    console.log("✅ AmmoJS plugin enabled");

    // ✅ Load GLTF Scene
    BABYLON.SceneLoader.ImportMesh("", "./Assets/Models/", "samsung-beach.gltf", scene, (meshes) => {
        console.log("✅ samsung-beach.gltf loaded. Mesh count:", meshes.length);

        meshes.forEach(mesh => {
            if (!(mesh instanceof BABYLON.Mesh) || mesh.name === "__root__") return;

            // 💡 Lightmaps
            if (mesh.material) {
                const uv2 = mesh.getVerticesData(BABYLON.VertexBuffer.UV2Kind);
                if (uv2) {
                    const tex = new BABYLON.Texture(`./Assets/Lightmaps/${mesh.name}_lightmap.png`, scene, false, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
                        () => {
                            tex.coordinatesIndex = 1;
                            mesh.material.lightmapTexture = tex;
                            mesh.material.useLightmapAsShadowmap = true;
                        },
                        () => console.warn(`❌ Lightmap not found for ${mesh.name}`)
                    );
                }
            }
        });

        // ✅ Apply raw Ammo collision to mk_collider
        ground = meshes.find(m => m.name === "mk_collider");
        if (ground) {
            console.log("✅ mk_collider found, creating raw Ammo body");

            ground.refreshBoundingInfo();
            const positions = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            const indices = ground.getIndices();

            if (!positions || !indices) {
                console.error("❌ mk_collider missing geometry");
                return;
            }

            const ammoMesh = new Ammo.btTriangleMesh(true, true);
            const scale = ground.scaling;

            for (let i = 0; i < indices.length; i += 3) {
                const i0 = indices[i] * 3;
                const i1 = indices[i + 1] * 3;
                const i2 = indices[i + 2] * 3;

                const v0 = new Ammo.btVector3(-positions[i0] * scale.x, positions[i0 + 1] * scale.y, positions[i0 + 2] * scale.z);
                const v1 = new Ammo.btVector3(-positions[i1] * scale.x, positions[i1 + 1] * scale.y, positions[i1 + 2] * scale.z);
                const v2 = new Ammo.btVector3(-positions[i2] * scale.x, positions[i2 + 1] * scale.y, positions[i2 + 2] * scale.z);

                ammoMesh.addTriangle(v0, v1, v2, true);
            }

            const shape = new Ammo.btBvhTriangleMeshShape(ammoMesh, true, true);
            shape.setLocalScaling(new Ammo.btVector3(scale.x, scale.y, scale.z));

            const transform = new Ammo.btTransform();
            transform.setIdentity();
            const origin = ground.getAbsolutePosition();
            transform.setOrigin(new Ammo.btVector3(origin.x, origin.y, origin.z));
            transform.setRotation(new Ammo.btQuaternion(0, 0, 0, 1));

            const motionState = new Ammo.btDefaultMotionState(transform);
            const localInertia = new Ammo.btVector3(0, 0, 0);
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(0, motionState, shape, localInertia);
            const body = new Ammo.btRigidBody(rbInfo);

            ammoWorld.addRigidBody(body);

            console.log("✅ Raw Ammo rigid body added for mk_collider");

            // ✅ Enable gravity now that collider is ready
            console.log("🔄 Setting gravity now that scene is ready...");
            scene.getPhysicsEngine().setGravity(new BABYLON.Vector3(0, -15, 0));

            console.log("🧠 Debug mesh rendered to inspect Ammo collider shape");

            console.log("✅ Raw Ammo rigid body added for mk_collider");

            ground.setEnabled(false);
        } else {
            console.warn("❌ mk_collider not found");
        }
        setTimeout(() => {
            document.getElementById("loadingScreen").style.display = "none";

            if (introBox) {
                introBox.classList.add("visible");
            }
            if (navBar) {
                navBar.classList.add("visible");
            }
        }, 2000);
    });

    // ✅ Capsule (player)
    const capsule = BABYLON.MeshBuilder.CreateBox("playerCapsule", { height: 3.2, width: .5, depth: .5 }, scene);
    capsule.isPickable = false;
    capsule.isVisible = false;
    capsule.position = new BABYLON.Vector3(-5.5, 1.6, 10);
    capsule.physicsImpostor = new BABYLON.PhysicsImpostor(
        capsule,
        BABYLON.PhysicsImpostor.CapsuleImpostor,
        { mass: 1, restitution: 0, friction: 100000},
        scene
    );
    console.log("✅ Capsule impostor applied");

    // ✅ Camera
    const camera = new BABYLON.ArcRotateCamera("camera", 0, Math.PI / 2, 0, capsule.position, scene);
    camera.attachControl(canvas, true);
    camera.minZ = 0.01;
    camera.radius = 0;

    camera.lowerRadiusLimit = -2;
    camera.upperRadiusLimit = camera.radius;
    camera.alpha = Math.PI*2.75;
    camera.fov = 1.2;
    scene.activeCamera = camera;
    camera.keysUp = [];
    camera.keysDown = [];
    camera.keysLeft = [];
    camera.keysRight = [];
    
    // ✅ Lock rotation on X/Z every frame
    scene.onBeforeRenderObservable.add(() => {
        const angVel = capsule.physicsImpostor.getAngularVelocity();
        capsule.physicsImpostor.setAngularVelocity(new BABYLON.Vector3(0, angVel.y, 0));
        capsule.rotationQuaternion = BABYLON.Quaternion.Identity();
        
    });

    // ✅ Input tracking
    scene.actionManager = new BABYLON.ActionManager(scene);
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyDownTrigger, evt => {
        inputMap[evt.sourceEvent.key.toLowerCase()] = true;
    }));
    scene.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnKeyUpTrigger, evt => {
        inputMap[evt.sourceEvent.key.toLowerCase()] = false;
    }));

    scene.onBeforeRenderObservable.add(() => {
        if (!window.inInspectMode) {
            const isBoosting = inputMap["shift"] === true;
            const baseSpeed = isBoosting ? 2.5 : 1.25;
            const gravityAssist = -0.3;
        
            // Flatten forward vector for horizontal movement
            let forward = camera.getForwardRay().direction;
            forward.y = 0;
            forward.normalize();
            const right = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), forward).normalize();
        
            let moveVec = BABYLON.Vector3.Zero();
    
            if (inputMap["w"] || inputMap["ArrowUp"]) moveVec.addInPlace(forward);
            if (inputMap["s"] || inputMap["ArrowDown"]) moveVec.addInPlace(forward.scale(-1));
            if (inputMap["a"] || inputMap["ArrowLeft"]) moveVec.addInPlace(right.scale(-1));
            if (inputMap["d"] || inputMap["ArrowRight"]) moveVec.addInPlace(right);
    
            const isMoving = !moveVec.equals(BABYLON.Vector3.Zero());
    
            if (isMoving && audioWalking) {
                if (!isWalking && audioEnabled && !audioWalking.isPlaying) {
                    audioWalking.playbackRate = isBoosting ? 1.5 : 1.0;
                    audioWalking.currentTime = 2.35;
                    audioWalking.play();
                    isWalking = true;
                } else {
                    audioWalking.playbackRate = isBoosting ? 1.5 : 1.0;
                }
            } else if (isWalking && audioWalking) {
                audioWalking.pause();
                isWalking = false;
            }
        
            const velocity = capsule.physicsImpostor.getLinearVelocity();
            const currentY = velocity.y;
            const finalY = currentY < 0 ? currentY : gravityAssist;
        
            const isFalling = currentY < -0.5;
            const effectiveSpeed = isFalling ? baseSpeed / 10 : baseSpeed;
        
            const now = performance.now();
            const horizontalVelocity = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
            const justStopped = moveVec.equals(BABYLON.Vector3.Zero()) && now - lastMoveTime < 150;
        
            if (!moveVec.equals(BABYLON.Vector3.Zero())) {
                const moveDirection = moveVec.normalize().scale(effectiveSpeed);
                capsule.physicsImpostor.setLinearVelocity(new BABYLON.Vector3(
                    moveDirection.x,
                    finalY,
                    moveDirection.z
                ));
                capsule.physicsImpostor.wakeUp();
                lastMoveTime = now;
            } else {
                if (horizontalVelocity < 0.3 || justStopped) {
                    // ✨ Smoothly dampen movement instead of snapping to 0
                    const dampingFactor = .9; // lower = stronger damp
                    const dampedX = velocity.x * dampingFactor;
                    const dampedZ = velocity.z * dampingFactor;
            
                    capsule.physicsImpostor.setLinearVelocity(new BABYLON.Vector3(dampedX, currentY, dampedZ));
            
                    const body = capsule.physicsImpostor.physicsBody;
                    if (body) {
                        body.setLinearVelocity(new Ammo.btVector3(dampedX, currentY, dampedZ));
                        body.clearForces();
                        body.activate();
                    }
                } else {
                    capsule.physicsImpostor.setLinearVelocity(new BABYLON.Vector3(velocity.x, currentY, velocity.z));
                }
            }
    
            // 🎥 Camera bobbing based on movement speed
            if (!moveVec.equals(BABYLON.Vector3.Zero())) {
                walkTime += scene.getEngine().getDeltaTime() * 0.005;
                const speedFactor = effectiveSpeed / 1;
            
                const bobOffset = new BABYLON.Vector3(
                    Math.sin(walkTime * 2) * 0.005 * speedFactor,
                    Math.sin(walkTime * 3) * 0.005 * speedFactor,
                    0
                );
            
                const baseTarget = capsule.position.clone();
                camera.target.copyFrom(baseTarget.add(bobOffset));
    
                // Camera alpha/beta sway (keep minimal)
                camera.alpha += Math.sin(walkTime * 0.5) * 0.0002;
                camera.beta  += Math.cos(walkTime * 0.4) * 0.0002;
            } else {
                walkTime += scene.getEngine().getDeltaTime() * 0.001;
            
                // Subtle idle motion: tiny position offset + camera sway
                const idleOffset = new BABYLON.Vector3(
                    Math.sin(walkTime * 0.6) * 0.002, // X sway
                    Math.sin(walkTime * 0.9) * 0.002, // Y sway
                    0
                );
            
                const baseTarget = capsule.position.clone();
                camera.target.copyFrom(baseTarget.add(idleOffset));
            
                // Camera alpha/beta sway (keep minimal)
                camera.alpha += Math.sin(walkTime * 0.5) * 0.00002;
                camera.beta  += Math.cos(walkTime * 0.4) * 0.00002;
            }
        } else {
            walkTime += scene.getEngine().getDeltaTime() * 0.001;
            
            // Subtle idle motion: tiny position offset + camera sway
            const idleOffset = new BABYLON.Vector3(
                Math.sin(walkTime * 0.6) * 0.002, // X sway
                Math.sin(walkTime * 0.9) * 0.002, // Y sway
                0
            );
        
            const baseTarget = capsule.position.clone();
            camera.target.copyFrom(baseTarget.add(idleOffset));
        
            // Camera alpha/beta sway (keep minimal)
            camera.alpha += Math.sin(walkTime * 0.5) * 0.00002;
            camera.beta  += Math.cos(walkTime * 0.4) * 0.00002;
        }
    });
    
    function drawTemp(target, duration, steps) {
        const { width, height } = thermScreenSize;
        const ctx = thermScreenCtx;
        const dt  = thermScreenDT;
      
        // if this is our very first draw, just paint it
        if (thermCurrentTemp === null) {
          thermCurrentTemp = target;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);
          ctx.font      = "bold 48px Arial";
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.fillText(`${target.toFixed(1)}°F`, width/2, height/2 + 16);
          dt.update();
          return;
        }
      
        const start = thermCurrentTemp;
        const min   = Math.min(start, target);
        const max   = Math.max(start, target);
        const interval    = duration / steps;
        const randomSteps = steps - 1;  // last step is the actual target
      
        // schedule random “flicker” frames
        for (let i = 1; i <= randomSteps; i++) {
          setTimeout(() => {
            const val = min + Math.random() * (max - min);
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, width, height);
            ctx.font      = "bold 48px Arial";
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.fillText(`${val.toFixed(1)}°F`, width/2, height/2 + 16);
            dt.update();
          }, i * interval);
        }
      
        // final frame: lock onto the true value
        setTimeout(() => {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);
          ctx.font      = "bold 48px Arial";
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.fillText(`${target.toFixed(1)}°F`, width/2, height/2 + 16);
          dt.update();
          thermCurrentTemp = target;
        }, duration);
      }

    function enterInspectMode(productName) {
        currentInspectedProduct = productName;
        window.inInspectMode = true;
    
        // Disable buttons if needed
        if (productName === "medicaldevice") {
            getSample.classList.add("disabled");
            checkTemp.classList.add("disabled");
        } else {
            getSample.classList.remove("disabled");
            checkTemp.classList.remove("disabled");
        }
    
        animateCameraFOV(camera, camera.fov, 0.8, 300);
        scene.environmentIntensity = 0.2;
        camera.detachControl(canvas);
        capsule.physicsImpostor.sleep();
    
        // Show UI
        closeInspect.style.opacity = "1";
        closeInspect.style.pointerEvents = "auto";
        checkTemp.style.display = "flex";
        getSample.style.display = "flex";
        inspectPhoto.style.display = "flex";
        globalPhoto.style.display = "none";
        topCenterButtonGroup.style.opacity = "1";
        tabletButton.style.opacity = "0";
        tabletButton.style.pointerEvents = "none";
    
        // Hide all products
        Object.values(productContainers).forEach(container => {
            container.rootNodes[0].setEnabled(false);
            const wrapper = scene.getNodeByName(`inspectWrapper-${container.rootNodes[0].name}`);
            if (wrapper) wrapper.setEnabled(false);
        });
    
        const container = productContainers[productName];
        const rootNode = container.rootNodes[0];
    
        // Create wrapper if missing
        let wrapper = scene.getNodeByName(`inspectWrapper-${productName}`);
        if (!wrapper) {
            wrapper = new BABYLON.TransformNode(`inspectWrapper-${productName}`, scene);
            wrapper.setParent(camera);
            wrapper.position = new BABYLON.Vector3(0, -0.005, 0.16);
            rootNode.setParent(wrapper);
            rootNode.position.set(0, 0, 0);
            setupObjectRotation(wrapper);
        }
    
        // Restore emission using base texture and strength
        const strength = emissionStrengths[productName] ?? 1;
        originalEmissions[productName] = [];
    
        container.meshes.forEach(mesh => {
            const mat = mesh.material;
            if (!mat) return;
    
            originalEmissions[productName].push({
                meshName: mesh.name,
                emissiveColor: mat.emissiveColor?.clone() || new BABYLON.Color3(0, 0, 0),
                emissiveTexture: mat.emissiveTexture || null
            });
    
            const baseTex = mat instanceof BABYLON.PBRMaterial ? mat.albedoTexture : mat.diffuseTexture;
            if (baseTex) mat.emissiveTexture = baseTex;
            mat.emissiveColor = new BABYLON.Color3(strength, strength, strength);
        });
    
        wrapper.setEnabled(true);
        wrapper.rotationQuaternion = BABYLON.Quaternion.Identity();
        rootNode.setEnabled(true);
    
        console.log(`🔍 Inspecting ${productName}`);
        return productName;
    }
    
    function exitInspectMode() {
        if (currentInspectedProduct) {
            const emissionData = originalEmissions[currentInspectedProduct];
            if (emissionData) {
                emissionData.forEach(({ meshName, emissiveColor, emissiveTexture }) => {
                    const mesh = scene.getMeshByName(meshName);
                    if (mesh && mesh.material) {
                        mesh.material.emissiveColor = emissiveColor.clone();
                        mesh.material.emissiveTexture = emissiveTexture || null;
                    }
                });
            }
        }
    
        currentInspectedProduct = null;
        window.inInspectMode = false;
    
        animateCameraFOV(camera, camera.fov, 1.2, 200);
        scene.environmentIntensity = 1;
        camera.attachControl(canvas, true);
        capsule.physicsImpostor.wakeUp();
    
        Object.values(productContainers).forEach(container => {
            container.rootNodes[0].setEnabled(false);
            const wrapper = scene.getNodeByName(`inspectWrapper-${container.rootNodes[0].name}`);
            if (wrapper) wrapper.setEnabled(false);
        });
    
        // Restore UI
        tabletButton.style.opacity = "1";
        tabletButton.style.pointerEvents = "auto";
        topCenterButtonGroup.style.opacity = "0";
        globalPhoto.style.display = "flex";
    
        setTimeout(() => {
            checkTemp.style.display = "none";
            getSample.style.display = "none";
            inspectPhoto.style.display = "none";
        }, 300);
    
        closeInspect.style.opacity = "0";
        closeInspect.style.pointerEvents = "none";
    }
    

    function setupObjectRotation(targetNode) {
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;
    
        const rotationSpeed = 0.01;
    
        const onPointerDown = (e) => {
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
        };
    
        const onPointerUp = () => {
            isDragging = false;
        };
    
        const onPointerMove = (e) => {
            if (!isDragging) return;
    
            const deltaX = e.clientX - lastX;
            const deltaY = e.clientY - lastY;
    
            // 🧭 Rotate around world Y and X axes (consistent no matter current orientation)
            const qx = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, -deltaX * rotationSpeed);
            const qy = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, -deltaY * rotationSpeed);
    
            const currentRotation = targetNode.rotationQuaternion ?? BABYLON.Quaternion.RotationYawPitchRoll(
                targetNode.rotation.y, targetNode.rotation.x, targetNode.rotation.z
            );
    
            // 🔁 Apply world-space quaternion rotation
            targetNode.rotationQuaternion = qx.multiply(qy).multiply(currentRotation);
    
            // Track mouse
            lastX = e.clientX;
            lastY = e.clientY;
        };
    
        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointerup", onPointerUp);
        canvas.addEventListener("pointermove", onPointerMove);
    
        // Clean-up handler
        targetNode._cleanupRotationEvents = () => {
            canvas.removeEventListener("pointerdown", onPointerDown);
            canvas.removeEventListener("pointerup", onPointerUp);
            canvas.removeEventListener("pointermove", onPointerMove);
        };
    
        // Ensure rotation mode is quaternion-based
        targetNode.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(targetNode.rotation);
        targetNode.rotation = new BABYLON.Vector3.Zero(); // reset Euler to avoid conflict
    }

    async function captureScreenshot() {

        audioPhoto.play();
    
        await new Promise(r => setTimeout(r, 1)); // allow DOM update
    
        const width = window.innerWidth / 2;
        const height = window.innerHeight / 2;
    
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
    
        scene.render(); // render a frame
        ctx.drawImage(engine.getRenderingCanvas(), 0, 0, width, height);
        const screenshotDataURL = canvas.toDataURL("image/png");

        // 🔦 Flash effect
        const originalExposure = scene.imageProcessingConfiguration.exposure;
        scene.imageProcessingConfiguration.exposure = 6; // Bright flash

        setTimeout(() => {
            const startTime = performance.now();
            function animateFlash() {
                const now = performance.now();
                const t = (now - startTime) / 50; // 100ms total
                if (t < 1) {
                    // ease out flash
                    scene.imageProcessingConfiguration.exposure = 6 - (6 - originalExposure) * t;
                    requestAnimationFrame(animateFlash);
                } else {
                    scene.imageProcessingConfiguration.exposure = originalExposure;
                }
            }
            animateFlash();
        }, 16); // slight delay to let the exposure actually apply first frame
    
        // Create thumbnail element
        const uniqueId = `photo-${Date.now()}`;
        const photo = document.createElement("div");
        photo.className = "photo-thumb";
        photo.id = `thumb-${uniqueId}`;
    
        const img = new Image();
        img.src = screenshotDataURL;
        img.alt = "Screenshot";
        img.className = "thumb-img";
        img.id = uniqueId;
    
        // Preview in overlay on click
        img.addEventListener("click", (e) => {
            e.stopPropagation();
            overlayImg.src = screenshotDataURL;
            overlay.classList.remove("hidden");
            currentOverlayPhotoId = uniqueId; // ✅ Track for deletion
        });
    
        photo.appendChild(img);
        
    
        // Determine correct grid
        let targetGrid = null;
    
        if (window.inInspectMode && currentInspectedProduct) {
            document.querySelectorAll(".product-inspection").forEach(section => {
                const title = section.querySelector("h3")?.textContent?.trim();
                const match = flaggedProducts.find(p => p.name === title && p.id === currentInspectedProduct);
                if (match) {
                    const grid = section.querySelector(".photo-grid");
                    if (grid && grid.children.length < 3) {
                        targetGrid = grid;
                        setTimeout(() => {  
                            giveHint(tabletButton, true, "Photo added to inspection report", true, 3000);
                        }, 700);
                    } else {
                        setTimeout(() => {  
                            giveHint(tabletButton, true, "You have reached the maximum number of photos for this item.", true, 3000);
                        }, 200);
                    }
                }
            });
        } else {
            const facilityGrid = document.querySelector(".facility-section .photo-grid");
            if (facilityGrid && facilityGrid.children.length < 8) {
                targetGrid = facilityGrid;
                setTimeout(() => {  
                    giveHint(tabletButton, true, "Photo added to inspection report", true, 3000);
                }, 700);
            } else {
                setTimeout(() => {  
                    giveHint(tabletButton, true, "You have reached the maximum number of photos for this facility.", true, 3000);
                }, 200);
            }
        }
    
        if (targetGrid) {
            targetGrid.appendChild(photo);
        
            // Count how many photos currently exist in the grid
            const photoCount = targetGrid.querySelectorAll(".photo-thumb").length;
            console.log(`📸 Photo added. Total visible in grid: ${photoCount}`);
        } else {
            console.warn("⚠️ No target grid found. Photo not added.");
        }
        
    }
    
    function giveHint(buttonElement, show = true, text = "", autoHide = true, duration = 3000) {

        if (!hintTooltip || !buttonElement) return;

        if (!show) {
            hintTooltip.style.opacity = "0";
            return;
        } else {
            // Set content
            hintTooltip.innerHTML = text;
        
            // Get button position
            const rect = buttonElement.getBoundingClientRect();
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
        
            // Position the tooltip above the button
            const tooltipHeight = 40;
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            
            if (spaceAbove >= tooltipHeight + 20) {
                // Place above
                hintTooltip.style.top = `${rect.top + scrollTop - tooltipHeight - 12}px`; // 12px gap
                hintTooltip.classList.remove("bottom-arrow");
                hintTooltip.classList.add("top-arrow");
            } else {
                // Not enough space above — place below
                hintTooltip.style.top = `${rect.bottom + scrollTop + 12}px`;
                hintTooltip.classList.remove("top-arrow");
                hintTooltip.classList.add("bottom-arrow");
            }
            
            hintTooltip.style.left = `${rect.left + scrollLeft + rect.width / 2}px`;
            hintTooltip.style.transform = "translateX(-50%)";
            hintTooltip.style.opacity = "1";
        
            if (autoHide) {
                setTimeout(() => {
                    hintTooltip.style.opacity = "0";
                }, duration);
            }
        }
    }
    
    // ✅ Lighting & Skybox
    scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("./Assets/Textures/warehouse.env", scene);
    scene.environmentIntensity = 1;
    scene.imageProcessingConfiguration.exposure = 1.2;
    scene.imageProcessingConfiguration.contrast = 1.3;
    scene.createDefaultLight(true);
    scene.createDefaultSkybox(scene.environmentTexture, true, 1000);

    function startTraining() {
        introOverlay.classList.add("hidden");

        setTimeout(() => {
            giveHint(tabletButton, true, "Check flagged products for inspection", false, 0);
        }, 1500); // optional delay before showing

        setTimeout(() => {
            tabletButton.style.opacity = "1";
            topRightButtonGroup.style.opacity = "1";
        }, 500);
    
        startBtn.style.opacity = "0";
        startBtn.style.pointerEvents = "none";

        checkTemp.style.display = "none";
        getSample.style.display = "none";
        inspectPhoto.style.display = "none";

        if (!inspectionLogs.dataset.initialized) {
            // Facility Block
            const facilitySection = document.createElement("div");
            facilitySection.className = "facility-section";
            facilitySection.innerHTML = `
                <div class="inspection-logs-header">
                    <p class="intro-text">
                        Any data collected throughout inspection will be automatically logged under its respective item below. To strenghten your report, you should also write any additional comments about your inspection that you believe are relevant for the FDA's compliance review staff.
                    </p>
                    <p class="spacer"></p>
                    <p class="spacer"></p>
                </div>
                <div class="facility-grid">
                    <img src="../../Assets/Images/warehouse.png" class="facility-photo" />
                    <div class="facility-fields">
                        <h3>Pacific Port Depot</h3>
                        <label>Room Temperature:
                            <input type="text" id="facilityTemperature" readonly value="Not measured ❌" />
                        </label>
                        <label>Room Humidity:
                            <input type="text" id="facilityHumidity" readonly value="Not measured ❌" />
                        </label>
                        <label>Structural Condition:
                            <textarea id="facilityStructure" placeholder="Describe physical condition..."></textarea>
                        </label>
                        <label>Cleanliness and Sanitation:
                            <textarea id="facilitySanitation" placeholder="Any visible hygiene issues..."></textarea>
                        </label>
                        <label>Additional Comments:
                            <textarea id="facilityComments" placeholder="Other observations..."></textarea>
                        </label>
                        <label>Captured Photos:
                            <div class="photo-placeholder">
                            <div class="photo-grid">

                            </div>
                        </div>
                    </div>
                </div>
            `;
            inspectionLogs.appendChild(facilitySection);
    
            // Product Blocks
            flaggedProducts.forEach(product => {
                const div = document.createElement("div");
                div.className = "product-inspection";
                div.dataset.id = product.id;                
                div.innerHTML = `
                    <hr />
                    <div class="product-block">
                        <img src="${product.image}" class="product-thumb" />
                        <div class="product-inspect-fields">
                            <h3>${product.name}</h3>
                            <label>Measured Temperature:
                                <input type="text" class="temperature-input" readonly value="Not measured ❌" />
                            </label>
                            <label>Sample Collected:
                                <input type="text" class="sample-status" readonly value="No ❌" />
                            </label>
                            <label>Inspection Details:
                                <textarea placeholder="Describe relevant details..."></textarea>
                            </label>
                            <label>Captured Photos:
                                <div class="photo-placeholder">
                                    <div class="photo-grid"></div>
                                </div>
                            </label>
                        </div>
                    </div>
                `;
                inspectionLogs.appendChild(div);
            });
    
            inspectionLogs.dataset.initialized = "true";
        }

        // ✅ Now user has interacted — safe to load & play audio
        audioWalking = new Audio("./Assets/Sounds/walking.m4a");
        audioWalking.loop = true;
        audioWalking.volume = 1;
        if (audioWalking) {
            console.log("✅ Walking sound loaded and ready");
        }

        // ✅ Now user has interacted — safe to load & play audio
        audioPhoto = new Audio("./Assets/Sounds/photo.m4a");
        audioPhoto.loop = false;
        audioPhoto.volume = .8;
        if (audioPhoto) {
            console.log("✅ Photo sound loaded and ready");
        }

        // ✅ Now user has interacted — safe to load & play audio
        audioClick = new Audio("./Assets/Sounds/click.m4a");
        audioClick.loop = false;
        audioClick.volume = .5;
        audioClick.addEventListener("canplaythrough", () => {
            console.log("✅ Click sound loaded and ready");
        });
        
        // ✅ Play ambient sound using native Audio
        if (!window.ambientSound) {
            window.ambientSound = new Audio("./Assets/Sounds/warehouse.m4a");
            ambientSound.loop = true;
            ambientSound.volume = 0.15;
            audioManager.add(ambientSound); // optional if using audioManager
        }
    
        ambientSound.play().then(() => {
            console.log("✅ Ambient sound started");
        }).catch(err => {
            console.warn("⚠️ Could not play ambient sound:", err);
        });
    
        // 🔊 Load fly buzz sound and attach to it
        const flyBuzz = new Audio("./Assets/Sounds/fly.m4a");
        flyBuzz.loop = true;
        flyBuzz.volume = 0;
        flyBuzz.play();
        
        const spawnCenter = new BABYLON.Vector3(-3.1, 0.6, .9);
        const fadeRadius = 5; // how far you want to hear the buzz
        
        scene.registerBeforeRender(() => {
            if (!capsule) return;
        
            const dist = BABYLON.Vector3.Distance(capsule.position, spawnCenter);
            const volume = Math.max(0, .8 - dist / fadeRadius);
        
            flyBuzz.volume = volume;
        });
    
        // 🪳 Now create the swarm visually
        pestParticles(scene, 30, 0.02, spawnCenter, 1, 2, 1, "../../Assets/Images/fly.png");
        pestParticles(scene, 20, 0.07, new BABYLON.Vector3(0, 0.05, -8), 6, 0, .5, "../../Assets/Images/cockroach.png");
        
    }

    // ✅ Play first 0.5s only
    function playClickSound(forward = true) {
        if (forward) {
            audioClick.currentTime = 0;
        } else {
            audioClick.currentTime = 0.01;
        }
        audioClick.play();

        // Stop it after 500ms
        setTimeout(() => {
            audioClick.pause();
            audioClick.currentTime = 0;
        }, 500);
    }

    function animateCameraFOV(camera, from, to, duration = 300) {
        const startTime = performance.now();
    
        const animate = () => {
            const now = performance.now();
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const easedT = t * (2 - t); // easeOutQuad
    
            camera.fov = from + (to - from) * easedT;
    
            if (t < 1) {
                requestAnimationFrame(animate);
            }
        };
    
        requestAnimationFrame(animate);
    }

    function fadeMaterial(show, durationInSeconds, material) {
        if (!material) return;
    
        const fps = 30;
        const totalFrames = durationInSeconds * fps;
    
        // Setup for blending
        material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        material.needDepthPrePass = true;
        material.backFaceCulling = true;
    
        const fromAlpha = show ? 0.01 : 1;
        const toAlpha   = show ? 1 : 0;
        material.alpha = fromAlpha;
    
        // Create fade animation
        const alphaAnimation = new BABYLON.Animation(
            "fadeAlpha",
            "alpha",
            fps,
            BABYLON.Animation.ANIMATIONTYPE_FLOAT,
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
        );
    
        alphaAnimation.setKeys([
            { frame: 0, value: fromAlpha },
            { frame: totalFrames, value: toAlpha }
        ]);
    
        const easing = new BABYLON.CubicEase();
        easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
        alphaAnimation.setEasingFunction(easing);
    
        material.animations = [alphaAnimation];
        scene.beginAnimation(material, 0, totalFrames, false);
    
        // Restore material settings after animation
        if (show) {
            setTimeout(() => {
                material.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
                material.needDepthPrePass = false;
                material.backFaceCulling = false;
            }, durationInSeconds * 1000);
        }
    }

    engine.runRenderLoop(() => {
        scene.render();
        const fpsCounter = document.getElementById('fpsCounter');
        fpsCounter.textContent = `FPS: ${engine.getFps().toFixed(0)}`;
    });
    window.addEventListener("resize", () => engine.resize());

    if (navigator.xr) {
        navigator.xr.isSessionSupported("immersive-vr").then((supported) => {
            if (supported) {
                enableVR(scene, ground); // Optional: pass ground if needed
            } else {
                console.log("🧯 XR not supported on this device");
            }
        }).catch(err => {
            console.error("🔌 XR check failed", err);
        });
    }
});
