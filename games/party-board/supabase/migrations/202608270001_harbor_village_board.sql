begin;

create or replace function private.party_board_build_board()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_spaces jsonb := '[]'::jsonb;
  v_branches jsonb := '[]'::jsonb;
  v_nodes jsonb;
  v_kind text;
  i integer;
begin
  for i in 0..67 loop
    if i = any(array[5,22,40,56]) then v_kind := 'shop';
    elsif i = any(array[11,20,30,38,48,59,65]) then v_kind := 'trap';
    elsif i = any(array[2,15,26,35,45,54,63]) then v_kind := 'event';
    elsif i = any(array[8,18,28,33,43,52,61]) then v_kind := 'special';
    else v_kind := 'normal';
    end if;
    v_spaces := v_spaces || jsonb_build_array(jsonb_build_object('id','r'||i,'index',i,'kind',v_kind));
  end loop;

  select jsonb_agg(jsonb_build_object('id','b1-'||ordinality,'index',ordinality-1,'kind',kind) order by ordinality)
  into v_nodes
  from unnest(array['normal','special','normal','event','normal','normal','trap']) with ordinality as node(kind,ordinality);
  v_branches := v_branches || jsonb_build_array(jsonb_build_object(
    'id','village-crossing','name','마을 세로길','splitId','r15','mergeId','r34',
    'guide',jsonb_build_array(jsonb_build_array(0,-5.3),jsonb_build_array(1.3,-3.2),jsonb_build_array(1.5,-1.5),jsonb_build_array(-.85,-1.2)),
    'nodes',v_nodes
  ));

  select jsonb_agg(jsonb_build_object('id','b2-'||ordinality,'index',ordinality-1,'kind',kind) order by ordinality)
  into v_nodes
  from unnest(array['normal','normal','event','normal','special','normal']) with ordinality as node(kind,ordinality);
  v_branches := v_branches || jsonb_build_array(jsonb_build_object(
    'id','north-pier-loop','name','부두 안쪽길','splitId','r18','mergeId','r27',
    'guide',jsonb_build_array(jsonb_build_array(5,-5.5),jsonb_build_array(7,-4.6),jsonb_build_array(7.4,-2.9),jsonb_build_array(8.2,-1.6)),
    'nodes',v_nodes
  ));

  select jsonb_agg(jsonb_build_object('id','b3-'||ordinality,'index',ordinality-1,'kind',kind) order by ordinality)
  into v_nodes
  from unnest(array['normal','event','normal','special','normal','normal']) with ordinality as node(kind,ordinality);
  v_branches := v_branches || jsonb_build_array(jsonb_build_object(
    'id','garden-cut','name','정원 대각길','splitId','r43','mergeId','r63',
    'guide',jsonb_build_array(jsonb_build_array(-6.5,6.7),jsonb_build_array(-4.8,8.1),jsonb_build_array(-2.6,9.5)),
    'nodes',v_nodes
  ));

  select jsonb_agg(jsonb_build_object('id','b4-'||ordinality,'index',ordinality-1,'kind',kind) order by ordinality)
  into v_nodes
  from unnest(array['normal','trap','normal','event','normal','special','normal']) with ordinality as node(kind,ordinality);
  v_branches := v_branches || jsonb_build_array(jsonb_build_object(
    'id','beach-village-loop','name','해변 마을길','splitId','r50','mergeId','r59',
    'guide',jsonb_build_array(jsonb_build_array(6.7,6.8),jsonb_build_array(7.6,7.8),jsonb_build_array(7.3,9.7),jsonb_build_array(5.7,10.2),jsonb_build_array(4.3,9.6)),
    'nodes',v_nodes
  ));

  return jsonb_build_object(
    'seed',encode(extensions.gen_random_bytes(12),'hex'),
    'layoutVersion','harbor-village-v1',
    'startId','r0',
    'layoutGuide',jsonb_build_array(
      jsonb_build_array(-11,8),jsonb_build_array(-11,-7),jsonb_build_array(-3,-7),jsonb_build_array(3,-7),
      jsonb_build_array(6,-7),jsonb_build_array(8,-9),jsonb_build_array(11,-8),jsonb_build_array(12,-5),
      jsonb_build_array(11,-2),jsonb_build_array(8,-1),jsonb_build_array(8,1),jsonb_build_array(4,1),
      jsonb_build_array(0,1),jsonb_build_array(-4,1),jsonb_build_array(-9,1),jsonb_build_array(-9,5),
      jsonb_build_array(-5.5,6),jsonb_build_array(-2,6),jsonb_build_array(2,6),
      jsonb_build_array(6,6),jsonb_build_array(8,6),jsonb_build_array(10,7),jsonb_build_array(10,10),
      jsonb_build_array(8,12),jsonb_build_array(5,11),jsonb_build_array(3,9),jsonb_build_array(0,11),
      jsonb_build_array(-4,10),jsonb_build_array(-8,9),jsonb_build_array(-11,8)
    ),
    'spaces',v_spaces,
    'branches',v_branches
  );
end;
$$;

revoke execute on function private.party_board_build_board() from public,anon,authenticated;

commit;
