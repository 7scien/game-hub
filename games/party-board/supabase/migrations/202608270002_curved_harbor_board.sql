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
  from unnest(array['normal','special','normal','event','normal','normal','trap','normal','event','normal','special','normal']) with ordinality as node(kind,ordinality);
  v_branches := v_branches || jsonb_build_array(jsonb_build_object(
    'id','village-crossing','name','중앙 마을길','splitId','r8','mergeId','r38',
    'guide',jsonb_build_array(
      jsonb_build_array(-11,-4),jsonb_build_array(-9,-1),jsonb_build_array(-6,.2),jsonb_build_array(-2,-.8),
      jsonb_build_array(2,.7),jsonb_build_array(6,-.2),jsonb_build_array(9,-1.5),jsonb_build_array(11,-3)
    ),
    'nodes',v_nodes
  ));

  select jsonb_agg(jsonb_build_object('id','b2-'||ordinality,'index',ordinality-1,'kind',kind) order by ordinality)
  into v_nodes
  from unnest(array['normal','normal','event','normal','special','normal','normal','trap','normal','event','normal']) with ordinality as node(kind,ordinality);
  v_branches := v_branches || jsonb_build_array(jsonb_build_object(
    'id','north-pier-loop','name','부두 반원길','splitId','r18','mergeId','r34',
    'guide',jsonb_build_array(
      jsonb_build_array(-2.2,-7.5),jsonb_build_array(0,-5),jsonb_build_array(4,-3),
      jsonb_build_array(8,-4),jsonb_build_array(8.5,-5.5),jsonb_build_array(10.5,-8)
    ),
    'nodes',v_nodes
  ));

  select jsonb_agg(jsonb_build_object('id','b3-'||ordinality,'index',ordinality-1,'kind',kind) order by ordinality)
  into v_nodes
  from unnest(array['normal','event','normal','special','normal','normal','trap','normal','event']) with ordinality as node(kind,ordinality);
  v_branches := v_branches || jsonb_build_array(jsonb_build_object(
    'id','garden-cut','name','정원 S지름길','splitId','r54','mergeId','r65',
    'guide',jsonb_build_array(
      jsonb_build_array(1.5,11),jsonb_build_array(-1,9),jsonb_build_array(-4,10),
      jsonb_build_array(-6.5,8),jsonb_build_array(-9,9)
    ),
    'nodes',v_nodes
  ));

  select jsonb_agg(jsonb_build_object('id','b4-'||ordinality,'index',ordinality-1,'kind',kind) order by ordinality)
  into v_nodes
  from unnest(array['normal','trap','normal','event','normal','special','normal','normal','event','normal']) with ordinality as node(kind,ordinality);
  v_branches := v_branches || jsonb_build_array(jsonb_build_object(
    'id','beach-village-loop','name','해변 마을고리','splitId','r40','mergeId','r50',
    'guide',jsonb_build_array(
      jsonb_build_array(8.8,3.5),jsonb_build_array(6.8,5.8),jsonb_build_array(6.2,8),
      jsonb_build_array(6.8,11),jsonb_build_array(6,12)
    ),
    'nodes',v_nodes
  ));

  return jsonb_build_object(
    'seed',encode(extensions.gen_random_bytes(12),'hex'),
    'layoutVersion','harbor-village-v2',
    'startId','r0',
    'layoutGuide',jsonb_build_array(
      jsonb_build_array(-13,7),jsonb_build_array(-14.8,3),jsonb_build_array(-13.3,0),jsonb_build_array(-15,-3.5),
      jsonb_build_array(-12.5,-8.5),jsonb_build_array(-8.5,-11),jsonb_build_array(-4,-10.2),jsonb_build_array(0,-11),
      jsonb_build_array(4,-10.6),jsonb_build_array(7,-12.5),jsonb_build_array(11,-12),jsonb_build_array(14,-9),
      jsonb_build_array(15,-5),jsonb_build_array(13.5,-1.5),jsonb_build_array(11,.5),jsonb_build_array(12,4.5),
      jsonb_build_array(14,8),jsonb_build_array(13,11.5),jsonb_build_array(10,14),jsonb_build_array(6,15),
      jsonb_build_array(2.5,13),jsonb_build_array(-1,15),jsonb_build_array(-5.5,12.7),
      jsonb_build_array(-9.8,14.5),jsonb_build_array(-12.8,9.5)
    ),
    'spaces',v_spaces,
    'branches',v_branches
  );
end;
$$;

revoke execute on function private.party_board_build_board() from public,anon,authenticated;

commit;
