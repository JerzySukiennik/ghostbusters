# Crew character definitions: rig scale, body radial factors (normalized to Jurek's rig), face operators, colours, hair styles.
JUREK_STATURE = 1.740

CREW = {
    'crew_1': dict(
        name='Desmond "Dez" Okafor', short='Dez', age=36, sex='m',
        summary='tall lanky engineer, rectangular dark acetate glasses, short dark crew cut, light olive skin, stubble',
        s=1.100,
        body=dict(
            torso=[(0.86, 1.10, 1.08, 1.14), (0.95, 1.10, 1.10, 1.12), (1.03, 1.16, 1.22, 1.12), (1.10, 1.16, 1.24, 1.12),
                   (1.20, 1.08, 1.12, 1.08), (1.28, 1.06, 1.10, 1.06), (1.36, 1.03, 1.06, 1.04), (1.42, 1.02, 1.04, 1.02)],
            neck=1.25, trap=1.04, delt=1.00, upperarm=(1.00, 0.98, 0.98), forearm=(1.04, 1.00, 0.98), hand=0.97,
            thigh=(1.08, 1.02, 0.97), shin=(0.95, 0.94, 0.90), foot=1.0,
            bulges=[], ease=1.0, belly_ease=1.0),
        skin=(0.62, 0.45, 0.34), skin_var=0.6, eyes=(0.33, 0.22, 0.11), hair=(0.035, 0.028, 0.024),
    ),
    'crew_2': dict(
        name='Walter "Walt" Kowalczyk', short='Walt', age=58, sex='m',
        summary='stocky older ex-firefighter, full salt-and-pepper beard, bald crown with grey sides, fair ruddy skin',
        s=0.975,
        body=dict(
            torso=[(0.86, 1.30, 1.45, 1.40), (0.95, 1.36, 1.75, 1.42), (1.03, 1.38, 2.05, 1.45), (1.10, 1.36, 2.00, 1.45),
                   (1.20, 1.28, 1.60, 1.42), (1.28, 1.24, 1.45, 1.40), (1.36, 1.18, 1.32, 1.34), (1.42, 1.12, 1.18, 1.22)],
            neck=1.52, trap=1.45, delt=1.38, upperarm=(1.40, 1.40, 1.36), forearm=(1.40, 1.34, 1.24), hand=1.18,
            thigh=(1.45, 1.38, 1.22), shin=(1.22, 1.20, 1.10), foot=1.06,
            bulges=[('belly', (0.0, -0.10, 1.02), (0.12, 0.10, 0.12), 0.045)], ease=0.95, belly_ease=0.55),
        skin=(0.80, 0.60, 0.50), skin_var=1.0, eyes=(0.36, 0.45, 0.52), hair=(0.62, 0.61, 0.60),
    ),
    'crew_3': dict(
        name='Imani "Mo" Asante', short='Mo', age=29, sex='f',
        summary='paranormal-tech woman, short natural coily hair, deep brown skin, athletic build',
        s=0.945,
        body=dict(
            torso=[(0.86, 1.30, 1.22, 1.50), (0.95, 1.26, 1.18, 1.42), (1.03, 1.10, 1.14, 1.24), (1.10, 1.06, 1.10, 1.16),
                   (1.20, 1.02, 1.04, 1.06), (1.28, 0.98, 1.02, 1.02), (1.36, 0.96, 1.00, 1.00), (1.42, 0.97, 1.00, 1.00)],
            neck=1.12, trap=0.92, delt=0.97, upperarm=(1.04, 1.06, 1.04), forearm=(1.06, 1.04, 1.00), hand=0.95,
            thigh=(1.36, 1.26, 1.06), shin=(1.06, 1.05, 0.96), foot=0.96,
            bulges=[('breastL', (0.082, -0.090, 1.235), (0.062, 0.05, 0.060), 0.036), ('breastR', (-0.082, -0.090, 1.235), (0.062, 0.05, 0.060), 0.036),
                    ('glutes', (0.0, 0.085, 0.86), (0.13, 0.06, 0.08), 0.012)], ease=1.0, belly_ease=1.0),
        skin=(0.30, 0.18, 0.12), skin_var=0.8, eyes=(0.16, 0.09, 0.05), hair=(0.018, 0.014, 0.012),
    ),
}
