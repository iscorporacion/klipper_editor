; KLIPPER EDITOR RECOVERY — EXAMPLE ONLY
; source layer: 69
; source Z: 13.9
; tool: T1
; IDEX: SINGLE

G90
G21
M83

SET_KINEMATIC_POSITION Z=13.9 SET_HOMED=Z
M140 S80
M109 S150 T1

G91
G1 Z2 F600
G90

G28 X Y
T1

; move to profile-validated safe position at clearance
; restore final thermal/runtime state
; require XY confirmation
; restore object definitions + exclusions
; append original G-code from selected layer
