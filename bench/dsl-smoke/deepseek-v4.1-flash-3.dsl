beat 3
retain token_row, context_vec
camera frame=[token_row, context_vec, dist_chart, sampled_mat] min_zoom=0.80
@cue:project
focus context_vec
chart dist_chart type=bars data=[the:0.08, cat:0.18, sat:0.09, on:0.03, mat:0.62] dock=right-of:context_vec
link proj_arrow from=context_vec to=dist_chart style=flow
@cue:top_prob
focus dist_chart item=mat
@cue:sample_draw
show sampled_mat label="mat" dock=below:dist_chart z=front
focus sampled_mat
@cue:append_tok
move sampled_mat to=right-of:tok_the2 duration=0.6