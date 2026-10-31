beat 3
retain token_row, context_vec
camera frame=[token_row, context_vec, proj_arrow, dist_chart, sampled_mat] min_zoom=0.80
@cue:project
link proj_arrow from=context_vec to=dist_chart style=flow
chart dist_chart type=bars data=[mat:0.62, sat:0.14, the:0.09, on:0.07, other:0.08] dock=right-of:context_vec
@cue:top_prob
focus dist_chart item=mat
@cue:sample_draw
show sampled_mat label="mat" dock=right-of:dist_chart z=front
focus sampled_mat
@cue:append_tok
move sampled_mat to=right-of:tok_the2 duration=0.8