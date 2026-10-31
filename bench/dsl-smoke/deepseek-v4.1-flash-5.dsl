beat 3
retain token_row, context_vec
camera frame=[token_row, context_vec, dist_chart, sampled_mat] min_zoom=0.80
@cue:project
chart dist_chart type=bars data=[mat:0.62, sat:0.18, on:0.09, the:0.07, cat:0.04] dock=right-of:context_vec
link proj_arrow from=context_vec to=dist_chart style=flow
@cue:top_prob
focus dist_chart item=mat
@cue:sample_draw
show sampled_mat dock=right-of:dist_chart z=front
@cue:append_tok
move sampled_mat to=inside:token_row duration=0.8