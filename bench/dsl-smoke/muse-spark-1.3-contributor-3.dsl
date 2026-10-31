beat 3
retain token_row, context_vec
group token_row contains=[tok_the, tok_cat, tok_sat, tok_on, tok_the2] zone=left_mid
camera frame=[token_row, context_vec, dist_chart] min_zoom=0.80
@cue:project
chart dist_chart type=bars data=[mat:0.62] dock=right-of:context_vec
link proj_arrow from=context_vec to=dist_chart style=solid
@cue:top_prob
focus dist_chart item=mat
@cue:sample_draw
show sampled_mat label="mat" dock=below:dist_chart
@cue:append_tok
move sampled_mat to=inside:token_row