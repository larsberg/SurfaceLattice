/*
globe sketch
 */


var app;

$(window).bind("load", function() {
	var debug = getQuerystring('debug') == "true";
	app = new APP(debug);
});

var BoxMorph = function( geometry)
{
	//clone and process the input geometry
	this.geometry = geometry.clone();
	this.geometry.computeBoundingBox();
	var bound = this.geometry.boundingBox;

	this.cv = [];
	for(var i=0; i<8; i++) this.cv[i] = new THREE.Vector3();

	this.cv[0].set( bound.min.x, bound.min.y, bound.min.z);
	this.cv[1].set( bound.min.x, bound.max.y, bound.min.z);
	this.cv[2].set( bound.max.x, bound.min.y, bound.min.z);
	this.cv[3].set( bound.max.x, bound.max.y, bound.min.z);
	this.cv[4].set( bound.min.x, bound.min.y, bound.max.z);
	this.cv[5].set( bound.min.x, bound.max.y, bound.max.z);
	this.cv[6].set( bound.max.x, bound.min.y, bound.max.z);
	this.cv[7].set( bound.max.x, bound.max.y, bound.max.z);

	var v = this.geometry.vertices;
	this.weights = []
	for(var i=0; i<v.length; i++)
	{
		this.weights[i] = new THREE.Vector3(
			THREE.Math.mapLinear( v[i].x, bound.min.x, bound.max.x, 0, 1 ),
			THREE.Math.mapLinear( v[i].y, bound.min.y, bound.max.y, 0, 1 ),
			THREE.Math.mapLinear( v[i].z, bound.min.z, bound.max.z, 0, 1 ));
	}

	console.log( this.geometry );

	this.update();
}

BoxMorph.prototype.lerp = function(a, b, t)
{
	return a + (b-a) * t;
}

BoxMorph.prototype.lerpV3 = function(p0, p1, t)
{
	return new THREE.Vector3( this.lerp(p0.x,p1.x,t), this.lerp(p0.y,p1.y,t), this.lerp(p0.z,p1.z,t) );//p0.clone().add( p1.clone().sub(p0).multiplyScalar( t ) );
}

BoxMorph.prototype.lerpEdges = function(e0a, e0b, e1a, e1b, u, v)
{
	return this.lerpV3( this.lerpV3( e0a, e0b, v), this.lerpV3( e1a, e1b, v), u );	
}

BoxMorph.prototype.lerpQuads = function(q0a, q0b, q0c, q0d, q1a, q1b, q1c, q1d, u, v, w)
{
	return this.lerpV3( this.lerpEdges(q0a, q0b, q0c, q0d, u, v), this.lerpEdges(q1a, q1b, q1c, q1d, u, v), w);
}

BoxMorph.prototype.getPoint = function(u, v, w)
{
	return this.lerpQuads(this.cv[0], this.cv[1], this.cv[2], this.cv[3], this.cv[4], this.cv[5], this.cv[6], this.cv[7], u,v,w);
}

BoxMorph.prototype.update = function()
{
	var w, v;
	for(var i=0; i<this.weights.length; i++)
	{
		w = this.weights[i];
		v = this.geometry.vertices[i];

		// console.log( this.getPoint(w.x, w.y, w.z) );
		v.copy(this.getPoint(w.x, w.y, w.z));
	}

	this.geometry.verticesNeedUpdate = true;
	this.geometry.normalsNeedUpdate = true;
};

function APP( _debug)
{
	//query strings
	var debug = _debug;

	//container
	var container = document.createElement( 'div' );
	container.style.position = 'absolute';
	container.style.left = '0px';
	container.style.top = '0px';
	document.body.appendChild( container );

	//basic animation/interaction vars
	var elapsedTime = 0;
	var gui, stats, renderer;
	var mouseDown = false, mouseDragged = false, bMouseOverGui = false;
	var clock = new THREE.Clock();
	var scene = new THREE.Scene();
	var camera, light, projector, raycaster, controls;

	// picking
	var pickingList = [];

	//point to point interpolation
	var p = [], pointU, pointsObject;

	//line to line interpolation
	var l = [], lineUV, linesObject;

	//face to face interpolation
	var f = [], faceUVW, facesObject, bound;

	//boxmoprh
	var boxMorph;

	function setup() 
	{
		//BASIC THREE SETUP
		camera = new THREE.PerspectiveCamera( 30, window.innerWidth / window.innerHeight, 1, 20000 );
		camera.position.z = 300;

		controls = new THREE.OrbitControls( camera );
		controls.addEventListener( 'change', draw );
		controls.noKeys = false;
		controls.noPan = false;
		controls.noRotate = false;
		controls.zoomSpeed = .25;
		controls.minDistance = 100;
		controls.maxDistance = 300;
		controls.autoRotate = false;

		projector = new THREE.Projector();
		raycaster = new THREE.Raycaster();

		light = new THREE.PointLight( 0xFFFFFF, 1, 3000 );
		light.position = camera.position;

		scene = new THREE.Scene();
		scene.add( camera );
		scene.add( light );

		//interpolation sketches
		var pointMat = new THREE.MeshBasicMaterial( {color: 0x22FFEE} );
		var pointMat2 = new THREE.MeshBasicMaterial( {color: 0xFFFF33} );
		var pointGeometry = new THREE.SphereGeometry( 1, 9, 6 );

		//interpolate between two points
		pointsObject = new THREE.Object3D();
		pointsObject.position.set(-70, 50, 0);
		scene.add(pointsObject);

		for(var i=0; i<2; i++)
		{
			var point = new THREE.Mesh( pointGeometry, pointMat );
			pointsObject.add(point);
			p[i] = point.position;
		}
		pointU = new THREE.Mesh( pointGeometry, pointMat2 );
		pointsObject.add(pointU);

		p[0].set(-10, 0, 0);
		p[1].set(10, 0, 0);


		//line to line interpolation
		linesObject = new THREE.Object3D();
		linesObject.position.set(0, 50, 0);
		scene.add(linesObject);

		for(var i=0; i<4; i++)
		{
			var linePoint = new THREE.Mesh( pointGeometry, pointMat );
			linesObject.add(linePoint);
			l[i] = linePoint.position;
		}
		lineUV = new THREE.Mesh( pointGeometry, pointMat2 );
		linesObject.add(lineUV);

		l[0].set(-10,-10, 0);
		l[1].set(-10, 10, 0);
		l[2].set( 10,-10, 0);
		l[3].set( 10, 10, 0);

		//face to face interpolation
		bound = new THREE.Box3( new THREE.Vector3(-10,-10,-10), new THREE.Vector3(10,10,10) );
		facesObject = new THREE.Object3D();
		facesObject.position.set(70, 50, 0);
		scene.add(facesObject);

		for(var i=0; i<8; i++){
			var facepoint = new THREE.Mesh(pointGeometry, pointMat);
			facesObject.add(facepoint);
			f[i] = facepoint.position;
		}

		f[0].set( bound.min.x, bound.min.y, bound.min.z);
		f[1].set( bound.min.x, bound.max.y, bound.min.z);
		f[2].set( bound.max.x, bound.min.y, bound.min.z);
		f[3].set( bound.max.x, bound.max.y, bound.min.z);
		f[4].set( bound.min.x, bound.min.y, bound.max.z);
		f[5].set( bound.min.x, bound.max.y, bound.max.z);
		f[6].set( bound.max.x, bound.min.y, bound.max.z);
		f[7].set( bound.max.x, bound.max.y, bound.max.z);

		var uvw = new THREE.Mesh(pointGeometry, pointMat2);
		faceUVW = uvw.position;
		facesObject.add(uvw);


		//BOX MORPH
		var geometry = new THREE.TorusGeometry( 20, 10, 11, 19 );
		boxMorph = new BoxMorph(geometry);

		var boxMorphMesh = new THREE.Mesh(boxMorph.geometry, new THREE.MeshNormalMaterial());

		scene.add(boxMorphMesh);
	}

	function lerp(a, b, t)
	{
		return a + (b-a) * t;
	}

	function lerpV3(p0, p1, t)
	{
		return new THREE.Vector3( lerp(p0.x,p1.x,t), lerp(p0.y,p1.y,t), lerp(p0.z,p1.z,t) );//p0.clone().add( p1.clone().sub(p0).multiplyScalar( t ) );
	}

	function lerpEdges(e0a, e0b, e1a, e1b, u, v)
	{
		return lerpV3( lerpV3( e0a, e0b, v), lerpV3( e1a, e1b, v), u );	
	}

	function lerpQuads(q0a, q0b, q0c, q0d, q1a, q1b, q1c, q1d, u, v, w)
	{
		return lerpV3(lerpEdges(q0a, q0b, q0c, q0d, u, v), lerpEdges(q1a, q1b, q1c, q1d, u, v), w);
	}

	/**
	 * [update description]
	 */
	function update()
	{

		controls.update();
		light.position.copy( camera.position );

		var t = clock.getElapsedTime();

		var u = Math.sin(t) * .5 + .5;
		var v = Math.sin(t * 2) * .5 + .5;
		var w = Math.sin(t * 4) * .5 + .5;

		//point to point
		pointU.position.copy( lerpV3(p[0], p[1], u ) );

		// // line to line
		lineUV.position.copy( lerpEdges( l[0], l[1], l[2], l[3], u, v) );		

		//face to face
		faceUVW.copy(lerpQuads(f[0],f[1],f[2],f[3],f[4],f[5],f[6],f[7], u, v, w));

		//box morph
		boxMorph.cv[0].z -= Math.sin(t);
		boxMorph.cv[1].z -= Math.sin(t);

		boxMorph.cv[2].x += Math.sin(t * 2);
		boxMorph.cv[3].x += Math.sin(t * 2);
		boxMorph.cv[6].x += Math.sin(t * 2);
		boxMorph.cv[7].x += Math.sin(t * 2);
		boxMorph.update();
	}

	/**
	 * DRAW
	 */
	function draw()
	{
		//to screen
		renderer.render( scene, camera, null, true );
	}

	//-----------------------------------------------------------
	function onWindowResize()
	{
		// camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 20000 );
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize( window.innerWidth, window.innerHeight );
	}

	function onMouseMove( event )
	{	
		if(mouseDown)
		{
			mouseDragged = true;
			onMouseDragged( event );
		}
	}

	function onMouseUp( event )
	{
		event.preventDefault();

		mouseDown = false;
		if(bMouseOverGui)	return;

		if(!mouseDragged)
		{
			//picking
			var mx = ( event.clientX / window.innerWidth ) * 2 - 1;
			var my = -( event.clientY / window.innerHeight ) * 2 + 1;
			var vector = new THREE.Vector3( mx, my, 1 );
			projector.unprojectVector( vector, camera );
			raycaster.set( camera.position, vector.sub( camera.position ).normalize() );
			var intersects = raycaster.intersectObjects( pickingList );// globe.children );

			//unselect the selected
			// if(selected !== undefined)
			// {
			// }

			//select the picked country
			if(intersects.length)
			{
			}
		}

		mouseDragged = false;
	}

	function onMouseDown( event )
	{
		mouseDown = true;
		if(bMouseOverGui)	return;
	}

	function onMouseDragged( event )
	{
		//
	}


	function onKeyDown( event )
	{
		switch( event.keyCode )
		{
			case keyboardMap["LEFT"]:
				console.log( "wtfg" );
				controls.rotateLeft(90);
				break;

			case keyboardMap["RIGHT"]:
				break;

			case keyboardMap["UP"]:
				break;

			case keyboardMap["DOWN"]:
				break;

			case keyboardMap["z"]:
				break;

			case keyboardMap["f"]:
				break;

			case keyboardMap['c']:
				break;

			case keyboardMap['q']:
				break;

			case keyboardMap['w']:
				break;	

			default:
				// console.log( event.keyCode );
				break;
		}
	}

	function rendererSetup()
	{
		renderer = new THREE.WebGLRenderer( { antialias: true, devicePixelRatio: 1 } );
		renderer.setClearColor( 0x171720 );
		renderer.sortObjects = false;
		renderer.setSize( window.innerWidth, window.innerHeight );
		renderer.autoClear = false;
		container.appendChild( renderer.domElement );
	}

	function events()
	{
		//events
		window.addEventListener( 'resize', onWindowResize, false );
		container.addEventListener( 'mousemove', onMouseMove, false );
		container.addEventListener( 'mouseup', onMouseUp, false );
		container.addEventListener( 'mousedown', onMouseDown, false );
		container.addEventListener( "keydown", onKeyDown, false);

		mouseDown = false;
		mouseDragged = false;
	}

	function animate() {
		requestAnimationFrame( animate );

		TWEEN.update();

		update();

		draw();

		if(debug)
		{
			stats.update();
		}
	}

	if ( ! Detector.webgl )
	{
		Detector.addGetWebGLMessage();
		document.getElementById( container ).innerHTML = "";
	}


	rendererSetup();
	if(debug)
	{	
		stats = new Stats();
		stats.domElement.style.position = 'absolute';
		stats.domElement.style.top = '10px';
		stats.domElement.style.left = '10px';
		container.appendChild( stats.domElement );
	}	

	setup();
	events();
	animate();

}

function getQuerystring(key, default_)
{
	if (default_==null) default_="";
	key = key.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
	var regex = new RegExp("[\\?&]"+key+"=([^&#]*)");
	var qs = regex.exec(window.location.href);
	if(qs == null)
		return default_;
	else
		return qs[1];
}
